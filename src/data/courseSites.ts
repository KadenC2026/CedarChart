import registry from "./courseSites.json";

export type CourseSite = {
  url: string;
  registrarUrl: string;
  sourcePage: string;
};

const sites = registry.sites as Record<string, CourseSite>;

export function courseWebsiteFor(subjectId: string) {
  return sites[subjectId]?.url;
}

export const courseSiteCatalogInfo = {
  academicYear: registry.academicYear,
  term: registry.term,
  source: registry.source,
  count: Object.keys(sites).length,
};
