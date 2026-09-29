import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageChrome";

describe("PageHeader", () => {
  it("keeps route copy available to assistive technology without rendering a visual header", () => {
    const { container } = render(
      <PageHeader
        eyebrow="Offensive Mode"
        title="Evidências"
        description="Caderno do engagement"
      />,
    );

    const heading = screen.getByRole("heading", { name: "Evidências" });
    expect(heading.parentElement).toHaveClass("sr-only");
    expect(screen.getByText("Caderno do engagement")).toBeInTheDocument();
    expect(container.querySelector(".page-header-utilities")).not.toBeInTheDocument();
  });

  it("keeps task metrics and actions in a compact visible row", () => {
    const { container } = render(
      <PageHeader
        title="Findings"
        metrics={<span>12 registros</span>}
        actions={<button type="button">Novo finding</button>}
      />,
    );

    const utilities = container.querySelector(".page-header-utilities");
    expect(utilities).toContainElement(screen.getByText("12 registros"));
    expect(utilities).toContainElement(screen.getByRole("button", { name: "Novo finding" }));
  });
});
