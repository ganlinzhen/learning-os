import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { IngestionReviewPage } from "./ingestion-review-page";

describe("IngestionReviewPage", () => {
  it("renders core and candidate sections", () => {
    render(
      <MemoryRouter>
        <IngestionReviewPage
          data={{
            sessionId: "session_1",
            sourceId: "source_1",
            title: "React Server Components",
            sourceType: "text",
            status: "reviewable",
            coreConcepts: [{ id: "1", title: "RSC", summary: "summary", isCore: true, isSelected: true, cards: [] }],
            candidateConcepts: [],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("核心知识点")).toBeInTheDocument();
    expect(screen.getByText("候选知识点")).toBeInTheDocument();
  });
});
