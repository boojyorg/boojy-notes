/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ErrorBoundary from "../../src/components/ErrorBoundary";

function ThrowingComponent() {
  throw new Error("Test error");
}

describe("ErrorBoundary", () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleSpy.mockRestore();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <p>Hello World</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hello World")).toBeTruthy();
  });

  it("catches error and shows error UI with message", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Test error")).toBeTruthy();
  });

  it('shows a "Reload App" button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Reload App")).toBeTruthy();
  });

  it('shows a "Copy Error" button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Copy Error")).toBeTruthy();
  });

  it("attempts to flush noteDataRef to localStorage on error", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const noteDataRef = { current: { title: "My Note", blocks: [] } };

    render(
      <ErrorBoundary noteDataRef={noteDataRef}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(setItemSpy).toHaveBeenCalledWith(
      "boojy-error-backup",
      JSON.stringify(noteDataRef.current),
    );
    setItemSpy.mockRestore();
  });
});
