import { describe, expect, it } from "vitest";
import { isMitEmail } from "./AuthContext";

describe("MIT email sign-in", () => {
  it("accepts MIT addresses without accepting lookalike domains", () => {
    expect(isMitEmail("student@mit.edu")).toBe(true);
    expect(isMitEmail(" STUDENT@MIT.EDU ")).toBe(true);
    expect(isMitEmail("student@alum.mit.edu")).toBe(false);
    expect(isMitEmail("student@mit.edu.example.com")).toBe(false);
  });
});
