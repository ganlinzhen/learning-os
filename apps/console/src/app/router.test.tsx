import { describe, expect, it } from "vitest";
import { routes } from "./router";

describe("console routes", () => {
  it("exposes top-level shell route and primary children", () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe("/");
    expect(routes[0]?.children?.map((route) => ("index" in route && route.index ? "index" : route.path))).toEqual([
      "index",
      "ingestions/:sessionId",
      "library",
      "concepts/:conceptId",
      "review",
      "search",
    ]);
  });
});
