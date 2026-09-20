import { describe, expect, it } from "vitest";
import type { RemoteCourse } from "../../domain/types";
import { buildCourseFamilies } from "../../domain/courseFamilies";
import { buildPrerequisiteForest } from "./CourseMapPage";

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

    expect(byId.get("6.100A")!.position.y).toBe(byId.get("6.1010")!.position.y);
    expect(byId.get("18.01")!.position.y).toBe(byId.get("18.02")!.position.y);
    expect(byId.get("18.01")!.position.y).toBeGreaterThan(byId.get("6.100A")!.position.y);
    expect(byId.get("6.100A")!.position.x).toBeLessThan(byId.get("6.1010")!.position.x);
    expect(byId.get("18.01")!.position.x).toBeLessThan(byId.get("18.02")!.position.x);
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
    expect(directEdge?.data?.routeY).toEqual(expect.any(Number));
    expect(adjacentEdge?.data?.routeY).toBeUndefined();
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
    expect(choice.expanded).toBe(true);
    expect(choice.optionFamilies.map((family) => family.id)).toEqual(["1.001", "1.002"]);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      `${choiceId}->1.003`,
    ]);
    expect(graph.edges.find((edge) => edge.source === choiceId)?.markerEnd).toBeDefined();
  });

  it("collapses unselected OR branches by default and expands on request", () => {
    const catalog = [
      course("1.001", "Option A"),
      course("1.002", "Option B"),
      course("1.003", "Destination", "1.001/1.002"),
    ];
    const { families } = buildCourseFamilies(catalog);
    const selected = families.filter((family) => ["1.001", "1.003"].includes(family.id));
    const collapsed = buildPrerequisiteForest(selected, families);
    const [[choiceId, choice]] = [...collapsed.logicByNodeId.entries()];

    expect(choice).toMatchObject({ expanded: false, hasSelectedOption: true, hiddenCount: 1 });
    expect(choice.optionFamilies.map((family) => family.id)).toEqual(["1.001"]);
    expect(collapsed.familyByNodeId.has("1.001")).toBe(true);
    expect(collapsed.familyByNodeId.has("1.002")).toBe(false);

    const expanded = buildPrerequisiteForest(selected, families, { [choiceId]: true });
    expect(expanded.logicByNodeId.get(choiceId)).toMatchObject({ expanded: true, hiddenCount: 0 });
    expect(expanded.logicByNodeId.get(choiceId)?.optionFamilies.map((family) => family.id)).toEqual([
      "1.001",
      "1.002",
    ]);
    expect(expanded.familyByNodeId.has("1.002")).toBe(false);
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
