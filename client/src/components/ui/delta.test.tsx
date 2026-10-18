// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Delta } from "./delta";

// "aria-label" on a plain <span> is not reliably announced, so screen readers could read the arrow's name instead of the
// sentence. The sentence is real (hidden) text and the arrow version is hidden from them.
describe("Delta", () => {
  it("shows the arrow text to the eye and hides it from screen readers", () => {
    render(<Delta text="▲ 20m vs usual" spoken="20m more than usual" />);
    expect(screen.getByText("▲ 20m vs usual").getAttribute("aria-hidden")).toBe("true");
  });

  it("gives screen readers the spoken sentence as real text, which is not hidden from them", () => {
    render(<Delta text="▼ 5m vs last week" spoken="5m less than last week" />);
    const spoken = screen.getByText("5m less than last week");
    expect(spoken.getAttribute("aria-hidden")).toBeNull();
    expect(spoken.className).toContain("sr-only"); // present for assistive technology, not drawn on screen
  });

  it("does not rely on aria-label, which a plain span does not reliably announce", () => {
    const { container } = render(<Delta text="▲ 1h vs usual" spoken="1h more than usual" />);
    expect(container.querySelector("[aria-label]")).toBeNull();
  });

  it("passes the styling through", () => {
    const { container } = render(<Delta className="text-coral" text="▲ 1m" spoken="1m more" />);
    expect((container.firstElementChild as HTMLElement).className).toBe("text-coral");
  });
});
