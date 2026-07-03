import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LibraryPage } from "./library-page";

describe("LibraryPage", () => {
  it("renders imported concept list", () => {
    render(
      <MemoryRouter>
        <LibraryPage concepts={[{ id: "1", title: "RSC", summary: "summary" }]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("RSC")).toBeInTheDocument();
  });
});
