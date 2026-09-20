export type NetworkResourceKind = "lab" | "urop" | "maker" | "innovation" | "career";

export type NetworkResource = {
  id: string;
  name: string;
  kind: NetworkResourceKind;
  description: string;
  url: string;
  contactLabel: string;
  contactUrl: string;
  keywords: string[];
  coursePrefixes: string[];
  verifiedAt: string;
  statusNote: string;
};

export type NetworkProfile = {
  interestQuery: string;
  careerGoal: string;
  backgroundExperience: string;
  courseIds: string[];
  studentYear: string;
};

export type NetworkMatch = NetworkResource & {
  matchReason: string;
  contactApproach: string;
  recommendationMethod: "AI" | "profile";
};

const STOP_WORDS = new Set([
  "about", "after", "and", "are", "build", "career", "course", "courses", "for", "from", "have", "into",
  "like", "looking", "that", "the", "their", "this", "through", "want", "with", "work", "would",
]);

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string) {
  return normalized(value).split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

export function rankNetworkResources(
  resources: NetworkResource[],
  profile: NetworkProfile,
  limit = 6,
): NetworkMatch[] {
  const profileText = [profile.interestQuery, profile.careerGoal, profile.backgroundExperience].filter(Boolean).join(" ");
  const profileTokens = new Set(tokens(profileText));
  const hasContext = Boolean(profileTokens.size || profile.courseIds.length);

  return resources
    .map((resource, index) => {
      const searchable = normalized(`${resource.name} ${resource.description} ${resource.keywords.join(" ")}`);
      const keywordHits = [...profileTokens].filter((token) => searchable.includes(token));
      const courseHits = profile.courseIds.filter((courseId) =>
        resource.coursePrefixes.some((prefix) => courseId.toLowerCase().startsWith(prefix.toLowerCase())),
      );
      const foundationalBoost = ["urop", "elx", "handshake", "career-fairs"].includes(resource.id) ? 3 : 0;
      const score = keywordHits.length * 18 + courseHits.length * 7 + foundationalBoost - index / 100;
      return { resource, keywordHits, courseHits, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ resource, keywordHits, courseHits }) => {
      const signals = [...keywordHits.slice(0, 3), ...courseHits.slice(0, 2)];
      const matchReason = hasContext && signals.length
        ? `Matches ${signals.join(", ")} from your cedar profile.`
        : "A useful starting point for finding current MIT opportunities and contacts.";
      return {
        ...resource,
        matchReason,
        contactApproach: resource.statusNote,
        recommendationMethod: "profile" as const,
      };
    });
}

export function groundedNetworkMatches(
  ranked: Array<{ resourceId?: unknown; matchReason?: unknown; contactApproach?: unknown }>,
  resources: NetworkResource[],
  limit = 6,
): NetworkMatch[] {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const seen = new Set<string>();
  return ranked.flatMap((item) => {
    const resourceId = clean(item.resourceId, 80);
    const resource = byId.get(resourceId);
    const matchReason = clean(item.matchReason, 360);
    const contactApproach = clean(item.contactApproach, 360);
    if (!resource || seen.has(resourceId) || !matchReason || !contactApproach) return [];
    seen.add(resourceId);
    return [{ ...resource, matchReason, contactApproach, recommendationMethod: "AI" as const }];
  }).slice(0, limit);
}
