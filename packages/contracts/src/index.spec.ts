import { describe, expect, it } from "vitest";
import { ingestionSessionStatuses } from "./index";

describe("contracts package", () => {
  it("exports ingestion statuses from the package root", () => {
    expect(ingestionSessionStatuses).toContain("reviewable");
  });
});
