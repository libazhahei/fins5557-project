import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import "../i18n";
import { ActivityBar } from "./components/ActivityBar";

describe("ActivityBar", () => {
  it("switches activity modes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <ActivityBar activity="lab" onChange={onChange} dataSourceLabel="Fixture" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /Market/i }));
    expect(onChange).toHaveBeenCalledWith("market");
    await user.click(screen.getByRole("button", { name: /Diff/i }));
    expect(onChange).toHaveBeenCalledWith("diff");
  });
});
