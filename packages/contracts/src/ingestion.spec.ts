import { describe, expect, it } from "vitest";
import { ingestionSessionStatuses } from "./ingestion";

describe("ingestion status list", () => {
  it("contains reviewable state", () => {
    expect(ingestionSessionStatuses).toContain("reviewable");
  });
});
