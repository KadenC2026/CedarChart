import { describe, expect, it } from "vitest";
import { groundedNetworkMatches, rankNetworkResources, type NetworkResource } from "./networkRecommendations";

const resources: NetworkResource[] = [
  { id: "csail", name: "CSAIL", kind: "lab", description: "AI and robotics", url: "https://example.edu/csail", contactLabel: "groups", contactUrl: "https://example.edu/groups", keywords: ["machine learning", "robotics"], coursePrefixes: ["6"], verifiedAt: "2026-09-19", statusNote: "Contact a matching group." },
  { id: "eaps", name: "EAPS", kind: "lab", description: "Climate and planetary science", url: "https://example.edu/eaps", contactLabel: "office", contactUrl: "mailto:eaps@example.edu", keywords: ["climate", "earth"], coursePrefixes: ["12"], verifiedAt: "2026-09-19", statusNote: "Contact the education office." },
];

describe("network recommendations", () => {
  it("uses profile text and courses to rank official resources", () => {
    const matches = rankNetworkResources(resources, {
      interestQuery: "robot learning",
      careerGoal: "machine learning research",
      backgroundExperience: "built autonomous robots",
      courseIds: ["6.3900"],
      studentYear: "junior",
    });
    expect(matches[0].id).toBe("csail");
    expect(matches[0].matchReason).toMatch(/machine|robot|6\.3900/i);
  });

  it("drops invented resource ids from AI output", () => {
    const matches = groundedNetworkMatches([
      { resourceId: "made-up-lab", matchReason: "Great fit", contactApproach: "Email them" },
      { resourceId: "eaps", matchReason: "Matches climate interests", contactApproach: "Ask the education office about current UROPs" },
    ], resources);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("eaps");
  });
});
