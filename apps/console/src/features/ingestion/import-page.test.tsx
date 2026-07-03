import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ImportPage } from "./import-page";

describe("ImportPage", () => {
  it("renders import form heading", () => {
    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "导入中心" })).toBeInTheDocument();
  });
});
