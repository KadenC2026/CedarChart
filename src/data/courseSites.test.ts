import { describe, expect, it } from "vitest";
import { courseSiteCatalogInfo, courseWebsiteFor } from "./courseSites";

describe("course website registry", () => {
  it("uses the current IntroML course website", () => {
    expect(courseWebsiteFor("6.3900")).toBe("https://introml.mit.edu/fall26");
  });

  it("does not treat a generic department listing as a course website", () => {
    expect(courseWebsiteFor("4.021")).toBeUndefined();
  });

  it("records its current official source and coverage", () => {
    expect(courseSiteCatalogInfo).toMatchObject({
      academicYear: "2026-2027",
      term: "Fall 2026",
      count: 107,
    });
  });
});
