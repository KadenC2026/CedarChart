import { describe, expect, it } from "vitest";
import type { RemoteCourse } from "../../domain/types";
import { buildCourseFamilies } from "../../domain/courseFamilies";
import { buildPrerequisiteForest, reconcileGraphNodes } from "./CourseMapPage";

function course(subject_id: string, title: string, prerequisites = ""): RemoteCourse {
  return { subject_id, title, prerequisites, description: "", total_units: 12 };
}

describe("course map forest layout", () => {
  it("merges a selected prerequisite and dependent into one graph and highlights both", () => {
    const catalog = [
      course("6.100A", "Introduction to Computer Science"),
      course("6.1010", "Fundamentals of Programming", "6.100A"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const graph = buildPrerequisiteForest(families, families);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes.every((node) => node.className?.includes("course-map-target"))).toBe(true);
    expect(new Set(graph.nodes.map((node) => node.id))).toEqual(new Set(["6.100A", "6.1010"]));
  });

  it("stacks disconnected course graphs vertically", () => {
    const catalog = [
      course("6.100A", "Introduction to Computer Science"),
      course("6.1010", "Fundamentals of Programming", "6.100A"),
      course("18.01", "Calculus I"),
      course("18.02", "Calculus II", "18.01"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const targets = families.filter((family) => ["6.1010", "18.02"].includes(family.id));
    const graph = buildPrerequisiteForest(targets, families);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));

    // Prerequisite cards can be taller when they expose an instructor-permission control.
    expect(Math.abs(byId.get("6.100A")!.position.y - byId.get("6.1010")!.position.y)).toBeLessThan(20);
    expect(Math.abs(byId.get("18.01")!.position.y - byId.get("18.02")!.position.y)).toBeLessThan(20);
    expect(byId.get("18.01")!.position.y).toBeGreaterThan(byId.get("6.100A")!.position.y);
    expect(byId.get("6.100A")!.position.x).toBeLessThan(byId.get("6.1010")!.position.x);
    expect(byId.get("18.01")!.position.x).toBeLessThan(byId.get("18.02")!.position.x);
  });

  it("uses the planner term color for scheduled course nodes", () => {
    const catalog = [course("6.100A", "Introduction to Computer Science")];
    const { families } = buildCourseFamilies(catalog);
    const graph = buildPrerequisiteForest(families, families, new Map([["6.100A", 5]]));

    expect(graph.nodes[0].className).toContain("course-map-scheduled");
    expect(graph.nodes[0].className).toContain("term-color-6");
  });

  it("gently aligns scheduled courses that share a term", () => {
    const catalog = [
      course("1.001", "First foundation"),
      course("1.002", "Second foundation"),
      course("1.003", "Destination", "1.001, 1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const graph = buildPrerequisiteForest(
      families,
      families,
      new Map([["1.001", 2], ["1.003", 2]]),
    );
    const positions = new Map(graph.nodes.map((node) => [node.id, node.position]));

    expect(Math.abs(positions.get("1.001")!.y - positions.get("1.003")!.y)).toBeLessThan(70);
  });

  it("treats prior-credit courses as satisfied, colored prerequisite roots", () => {
    const catalog = [
      course("1.000", "Foundation"),
      course("1.001", "Credited option", "1.000"),
      course("1.002", "Other option"),
      course("1.003", "Destination", "1.001/1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const targets = families.filter((family) => ["1.001", "1.003"].includes(family.id));
    const graph = buildPrerequisiteForest(
      targets,
      families,
      new Map(),
      new Map([["1.001", "Prior credit · prerequisite satisfied"]]),
    );
    const creditedNode = graph.nodes.find((node) => node.id === "1.001");

    expect(graph.logicByNodeId.size).toBe(0);
    expect(creditedNode?.className).toContain("course-map-credited");
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(expect.arrayContaining([
      "1.000->1.001",
      "1.001->1.003",
    ]));
  });

  it("routes arrows that skip a column through an outer lane", () => {
    const catalog = [
      course("1.001", "Foundations"),
      course("1.002", "Intermediate", "1.001"),
      course("1.003", "Advanced", "1.001 and 1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const targets = families.filter((family) => ["1.002", "1.003"].includes(family.id));
    const graph = buildPrerequisiteForest(targets, families);
    const directEdge = graph.edges.find((edge) => edge.source === "1.001" && edge.target === "1.003");
    const adjacentEdge = graph.edges.find((edge) => edge.source === "1.002" && edge.target === "1.003");

    expect(graph.edges.every((edge) => edge.type === "routed")).toBe(true);
    expect(directEdge?.data?.routeLaneOffset).toEqual(expect.any(Number));
    expect(directEdge?.data?.routeSide).toMatch(/above|below/);
    expect(adjacentEdge?.data?.routeLaneOffset).toBeUndefined();
  });

  it("spreads fan-out arrows across separate card ports", () => {
    const catalog = [
      course("1.001", "Foundation"),
      course("1.002", "First branch", "1.001"),
      course("1.003", "Second branch", "1.001"),
      course("1.004", "Third branch", "1.001"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const targets = families.filter((family) => ["1.002", "1.003", "1.004"].includes(family.id));
    const graph = buildPrerequisiteForest(targets, families);
    const offsets = graph.edges
      .filter((edge) => edge.source === "1.001")
      .map((edge) => edge.data?.sourceOffset);

    expect(new Set(offsets).size).toBe(3);
    expect(Math.max(...offsets as number[])).toBeGreaterThanOrEqual(16);
  });

  it("keeps course and choice cards from overlapping", () => {
    const catalog = [
      course("1.001", "Foundation A"),
      course("1.002", "Foundation B"),
      course("1.003", "Alternative destination", "1.001/1.002"),
      course("1.004", "Direct destination", "1.001"),
      course("1.005", "Final destination", "1.003, 1.004"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const targets = families.filter((family) => ["1.003", "1.004", "1.005"].includes(family.id));
    const graph = buildPrerequisiteForest(targets, families);
    const bounds = graph.nodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: node.id.startsWith("logic:") ? (node.className?.includes("any") ? 260 : 44) : 210,
      height: node.id.startsWith("logic:") ? (node.className?.includes("any") ? 164 : 92) : 82,
    }));

    for (let left = 0; left < bounds.length; left += 1) {
      for (let right = left + 1; right < bounds.length; right += 1) {
        const a = bounds[left];
        const b = bounds[right];
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlaps, `${a.id} and ${b.id} should not overlap`).toBe(false);
      }
    }
  });

  it("adds instructor permission as a selectable alternative in every One Of box", () => {
    const catalog = [
      course("1.001", "Foundation A"),
      course("1.002", "Foundation B"),
      course("1.003", "Alternative destination", "1.001/1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const target = families.find((family) => family.id === "1.003")!;
    const graph = buildPrerequisiteForest([target], families);
    const choice = [...graph.logicByNodeId.values()].find((logic) => logic.kind === "any");

    expect(choice?.optionFamilies.map((family) => family.id)).toEqual(["1.001", "1.002"]);
    expect(choice?.instructorPermissionChoiceId).toBe("1.003:1.003");
    expect(choice?.instructorPermissionSelected).toBe(false);
  });

  it("replaces a waived course's prerequisite branches without changing its course-card color", () => {
    const catalog = [
      course("1.001", "Foundation A"),
      course("1.002", "Foundation B"),
      course("1.003", "Alternative destination", "1.001/1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const target = families.find((family) => family.id === "1.003")!;
    const graph = buildPrerequisiteForest([target], families, new Map(), new Map(), new Set(["mit:1.003"]));

    expect(graph.nodes.map((node) => node.id)).toEqual(["1.003"]);
    expect(graph.nodes[0].className).not.toContain("course-map-permission-waived");
    expect(graph.edges).toEqual([]);
  });

  it("removes only the approved One Of group while retaining other prerequisites", () => {
    const catalog = [
      course("1.001", "Required foundation"),
      course("1.002", "Option A"),
      course("1.003", "Option B"),
      course("1.004", "Destination", "1.001, (1.002/1.003)"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const target = families.find((family) => family.id === "1.004")!;
    const graph = buildPrerequisiteForest(
      [target],
      families,
      new Map(),
      new Map(),
      new Set(),
      new Set(["1.004:1.004.1"]),
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["1.001", "1.004"]));
    expect(graph.nodes.map((node) => node.id)).not.toEqual(expect.arrayContaining(["1.002", "1.003"]));
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain("1.001->1.004");
  });

  it("waives one direct prerequisite edge while retaining the other direct edges", () => {
    const catalog = [
      course("18.05", "Probability"),
      course("6.3900", "Machine Learning"),
      course("6.7960", "Deep Learning", "18.05, 6.3900"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const target = families.find((family) => family.id === "6.7960")!;
    const graph = buildPrerequisiteForest(
      [target],
      families,
      new Map(),
      new Map(),
      new Set(),
      new Set(),
      new Set(["6.7960:18.05"]),
    );

    expect(graph.nodes.map((node) => node.id)).not.toContain("18.05");
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(["6.3900->6.7960"]);
  });


  it("orders connected branches to avoid a needless crossing", () => {
    const catalog = [
      course("1.001", "Alpha"),
      course("1.002", "Beta"),
      course("1.003", "Branch from beta", "1.002"),
      course("1.004", "Branch from alpha", "1.001"),
      course("1.005", "Destination", "1.003, 1.004"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const targets = families.filter((family) => ["1.003", "1.004", "1.005"].includes(family.id));
    const graph = buildPrerequisiteForest(targets, families);
    const positions = new Map(graph.nodes.map((node) => [node.id, node.position]));

    // Alpha is above Beta, so its dependent is placed above Beta's dependent.
    expect(positions.get("1.004")!.y).toBeLessThan(positions.get("1.003")!.y);
  });

  it("groups OR prerequisites inside one choice container", () => {
    const catalog = [
      course("1.001", "Option A"),
      course("1.002", "Option B"),
      course("1.003", "Destination", "1.001/1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const target = families.find((family) => family.id === "1.003")!;
    const graph = buildPrerequisiteForest([target], families);
    const [[choiceId, choice]] = [...graph.logicByNodeId.entries()];

    expect(choice.kind).toBe("any");
    expect(choice.optionFamilies.map((family) => family.id)).toEqual(["1.001", "1.002"]);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      `${choiceId}->1.003`,
    ]);
    expect(graph.edges.find((edge) => edge.source === choiceId)?.markerEnd).toBeDefined();
  });

  it("uses a direct prerequisite node when only one catalog course is visible in an OR", () => {
    const catalog = [
      course("1.001", "Visible option"),
      course("1.003", "Destination", "1.001/''permission of instructor''"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const target = families.find((family) => family.id === "1.003")!;
    const graph = buildPrerequisiteForest([target], families);

    expect(graph.logicByNodeId.size).toBe(0);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toContain("1.001->1.003");
  });

  it("replaces a satisfied OR container with the selected prerequisite subtree", () => {
    const catalog = [
      course("1.000", "Foundation"),
      course("1.001", "Option A", "1.000"),
      course("1.002", "Option B"),
      course("1.003", "Destination", "1.001/1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const selected = families.filter((family) => ["1.001", "1.003"].includes(family.id));
    const graph = buildPrerequisiteForest(selected, families);

    expect(graph.logicByNodeId.size).toBe(0);
    expect(graph.familyByNodeId.has("1.000")).toBe(true);
    expect(graph.familyByNodeId.has("1.001")).toBe(true);
    expect(graph.familyByNodeId.has("1.002")).toBe(false);
    expect(graph.replacementPositionSourceByNodeId.get("1.001")).toContain("logic:1.003");
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(expect.arrayContaining([
      "1.000->1.001",
      "1.001->1.003",
    ]));
  });

  it("reflows existing nodes when an OR replacement reveals a deeper subtree", () => {
    const catalog = [
      course("1.000", "Foundation"),
      course("1.001", "Option A", "1.000"),
      course("1.002", "Option B"),
      course("1.004", "Direct requirement"),
      course("1.003", "Destination", "1.004, (1.001/1.002)"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const destination = families.find((family) => family.id === "1.003")!;
    const unresolved = buildPrerequisiteForest([destination], families);
    const selected = families.filter((family) => ["1.001", "1.003"].includes(family.id));
    const resolved = buildPrerequisiteForest(selected, families);
    const choiceId = [...unresolved.logicByNodeId.keys()][0];
    const choicePosition = unresolved.nodes.find((node) => node.id === choiceId)!.position;
    const foundationPosition = resolved.nodes.find((node) => node.id === "1.000")!.position;
    const staleNodes = unresolved.nodes.map((node) =>
      node.id === "1.004" ? { ...node, position: foundationPosition } : node,
    );
    const reconciled = reconcileGraphNodes(resolved, staleNodes, new Map());
    const byId = new Map(reconciled.map((node) => [node.id, node.position]));

    expect(byId.get("1.001")).toEqual(choicePosition);
    expect(byId.get("1.004")).not.toEqual(byId.get("1.000"));
  });

  it("reveals prerequisites only for selected courses", () => {
    const catalog = [
      course("1.001", "Foundation"),
      course("1.002", "Intermediate", "1.001"),
      course("1.003", "Advanced", "1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const advanced = families.find((family) => family.id === "1.003")!;
    const intermediate = families.find((family) => family.id === "1.002")!;

    const advancedOnly = buildPrerequisiteForest([advanced], families);
    expect(advancedOnly.familyByNodeId.has("1.002")).toBe(true);
    expect(advancedOnly.familyByNodeId.has("1.001")).toBe(false);

    const bothSelected = buildPrerequisiteForest([intermediate, advanced], families);
    expect(bothSelected.familyByNodeId.has("1.001")).toBe(true);
  });
});
