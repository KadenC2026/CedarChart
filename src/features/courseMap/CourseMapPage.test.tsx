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
    expect(byId.get("18.01")!.position.x).toBe(byId.get("6.100A")!.position.x);
  });
});
