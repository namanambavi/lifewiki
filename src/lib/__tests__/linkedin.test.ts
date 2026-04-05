import { describe, it, expect, vi } from "vitest";
import { extractUsername } from "../linkedin";

describe("extractUsername", () => {
  it("extracts username from full URL", () => {
    expect(extractUsername("https://linkedin.com/in/naman")).toBe("naman");
    expect(extractUsername("https://www.linkedin.com/in/naman/")).toBe("naman");
    expect(extractUsername("linkedin.com/in/naman")).toBe("naman");
  });

  it("throws on invalid URL", () => {
    expect(() => extractUsername("https://google.com")).toThrow("Invalid LinkedIn URL");
  });
});
