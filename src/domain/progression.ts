import type { RemoteCourse, Requirement } from "./types";
import { isArchivedRequirement, requirementLabel, requirementSubjects } from "./requirements";
export function mentionsToken(text: string | undefined, token: string) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9.:])${escaped}([^A-Za-z0-9.:]|$)`).test(text ?? "");
}
export function referencesCourse(text: string | undefined, course: RemoteCourse) {
  return mentionsToken(text, course.subject_id) || Boolean(course.gir_attribute && mentionsToken(text, `GIR:${course.gir_attribute}`));
}
export function progressionGroups(courses: RemoteCourse[], requirements: Record<string, Requirement>) {
  const majors = Object.entries(requirements).filter(([id, req]) => id.startsWith("major") && !isArchivedRequirement(req));
  const groups: { id: string; label: string; courses: RemoteCourse[] }[] = [];
  const assigned = new Set<string>();
  for (const [id, req] of majors) {
    const subjects = new Set(requirementSubjects(req));
    const department = req["short-title"]?.split(/[-/]/)[0];
    const matches = courses.filter(c => subjects.has(c.subject_id) || c.subject_id.split(".")[0] === department);
    if (matches.length) {
      groups.push({ id, label: requirementLabel(req), courses: matches });
      matches.forEach(c => assigned.add(c.subject_id));
    }
  }
  const other = new Map<string, RemoteCourse[]>();
  courses.filter(c => !assigned.has(c.subject_id)).forEach(c => {
    const department = c.subject_id.split(".")[0];
    other.set(department, [...(other.get(department) ?? []), c]);
  });
  for (const [department, courses] of other) {
    const name = majors.find(([, req]) => req["short-title"] === department)?.[1]["title-no-degree"];
    groups.push({ id: `department:${department}`, label: `Course ${department}${name ? ` — ${name}` : ""} · Other subjects`, courses });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
