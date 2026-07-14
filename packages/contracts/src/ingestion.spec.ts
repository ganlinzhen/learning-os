import { describe, expect, it } from "vitest";
import { ingestionSessionStatuses, type IngestionDetailDto } from "./ingestion";

describe("ingestion status list", () => {
  it("contains reviewable state", () => {
    expect(ingestionSessionStatuses).toContain("reviewable");
  });

  it("exposes retryable failed agent task in ingestion detail", () => {
    const detail: IngestionDetailDto = {
      sessionId: "session-1",
      sourceId: "source-1",
      title: "失败导入",
      sourceType: "url",
      status: "failed",
      coreConcepts: [],
      candidateConcepts: [],
      task: {
        id: "task-1",
        status: "failed",
        attemptCount: 1,
        lastErrorCode: "web_fetch_failed",
        lastErrorMessage: "网页抓取失败",
        canRetry: true,
      },
    };

    expect(detail.task.canRetry).toBe(true);
  });
});
