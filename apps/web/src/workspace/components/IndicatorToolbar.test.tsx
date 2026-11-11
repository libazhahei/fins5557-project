import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IndicatorToolbar } from "./IndicatorToolbar";

describe("IndicatorToolbar", () => {
  it("toggles an indicator from the compact row", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<IndicatorToolbar enabled={["boll"]} onToggle={onToggle} compact />);
    await user.click(screen.getByRole("button", { name: "SMA" }));
    expect(onToggle).toHaveBeenCalledWith("sma");
  });

  it("shows VP window chips next to Vol Profile when enabled", async () => {
    const onToggle = vi.fn();
    const onVp = vi.fn();
    const user = userEvent.setup();
    render(
      <IndicatorToolbar
        enabled={["vp"]}
        onToggle={onToggle}
        compact
        showVpWindow
        vpWindowMode="visible"
        onVpWindowModeChange={onVp}
      />,
    );
    expect(screen.getByRole("button", { name: "Visible" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "30" }));
    expect(onVp).toHaveBeenCalledWith(30);
  });
});
