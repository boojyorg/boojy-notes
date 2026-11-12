/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/context/ThemeContext";
import RenameLocation from "../../src/phone/RenameLocation";

afterEach(cleanup);

const show = () => {
  const onRename = vi.fn();
  const onClose = vi.fn();
  render(
    <ThemeProvider>
      <RenameLocation name="Work" taken={["Phone"]} onRename={onRename} onClose={onClose} />
    </ThemeProvider>,
  );
  const type = (value: string) =>
    fireEvent.change(screen.getByLabelText("Name"), { target: { value } });
  const rename = () => fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  return { onRename, onClose, type, rename };
};

describe("another name for a storage location", () => {
  it("starts from the name it has, and takes the new one trimmed", () => {
    const { onRename, type, rename } = show();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Work");
    expect(screen.getByText(/Its folder keeps its own name/)).toBeTruthy();
    type("  Journal ");
    rename();
    expect(onRename).toHaveBeenCalledWith("Journal");
  });

  // Nothing is said while the name is still being typed: only once Rename was tried.
  it("says what is wrong with a name only once it is tried, and changes nothing", () => {
    const { onRename, type, rename } = show();
    type("phone");
    expect(screen.queryByRole("alert")).toBeNull();
    rename();
    expect(screen.getByRole("alert").textContent).toBe("Another location has this name.");
    type("");
    expect(screen.getByRole("alert").textContent).toBe("Give it a name.");
    rename();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("changes nothing on Back or Escape", () => {
    const { onRename, onClose } = show();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onRename).not.toHaveBeenCalled();
  });
});
