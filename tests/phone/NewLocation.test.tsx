/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/context/ThemeContext";
import NewLocation from "../../src/phone/NewLocation";

afterEach(cleanup);

const show = () => {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(
    <ThemeProvider>
      <NewLocation taken={["Phone", "Work"]} onAdd={onAdd} onClose={onClose} />
    </ThemeProvider>,
  );
  const type = (value: string) =>
    fireEvent.change(screen.getByLabelText("Name"), { target: { value } });
  const add = () => fireEvent.click(screen.getByRole("button", { name: "Add" }));
  return { onAdd, onClose, type, add };
};

describe("a new storage location's name", () => {
  it("is all that is asked, and adds it trimmed", () => {
    const { onAdd, type, add } = show();
    expect(screen.getByText(/You choose the folder next/)).toBeTruthy();
    type("  Private ");
    add();
    expect(onAdd).toHaveBeenCalledWith("Private");
  });

  // Nothing is said while the name is still being typed: only once Add was tried.
  it("says what is wrong with a name only once Add is tried, and adds nothing", () => {
    const { onAdd, type, add } = show();
    type("work");
    expect(screen.queryByRole("alert")).toBeNull();
    add();
    expect(screen.getByRole("alert").textContent).toBe("Another location has this name.");
    type("");
    expect(screen.getByRole("alert").textContent).toBe("Give it a name.");
    add();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("adds nothing on Back or Escape", () => {
    const { onAdd, onClose } = show();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
