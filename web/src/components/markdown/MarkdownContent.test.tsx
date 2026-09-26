import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="local atual">{`${location.pathname}${location.search}`}</output>;
}

describe("MarkdownContent", () => {
  it("navigates app links through the React router", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/origem"]}>
        <MarkdownContent markdown="[Abrir engagement](/redmode/engagements/acme?view=scope)" />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: "Abrir engagement" }));
    expect(screen.getByLabelText("local atual")).toHaveTextContent(
      "/redmode/engagements/acme?view=scope",
    );
  });
});
