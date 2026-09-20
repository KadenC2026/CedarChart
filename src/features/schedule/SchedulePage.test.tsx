// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "../../state/AppContext";
import { AuthProvider } from "../../auth/AuthContext";
import SchedulePage from "./SchedulePage";

const courses = [
  {
    subject_id: "6.1200",
    title: "Mathematics for Computer Science",
    total_units: 12,
    level: "U",
    schedule: "Lecture,26-100/TR/0/2.30-4",
  },
  {
    subject_id: "18.06",
    title: "Linear Algebra",
    total_units: 12,
    level: "U",
    schedule: "Lecture,26-100/TR/0/3-4.30",
  },
  {
    subject_id: "6.1910",
    title: "Computation Structures",
    total_units: 12,
    level: "U",
    schedule: "Lecture,26-100/MW/0/11-12.30",
  },
  {
    subject_id: "7.012",
    title: "Introductory Biology",
    total_units: 12,
    level: "U",
    schedule: "",
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const body = url.includes("catalog")
        ? courses
        : url.includes("requirements")
          ? {}
          : { importedAt: "2026-09-19T18:55:16.629584+00:00" };
      return { ok: true, json: async () => body };
    }),
  );
});

afterEach(cleanup);

async function addSubject(user: ReturnType<typeof userEvent.setup>, subjectId: string, titleWord: string) {
  const search = screen.getByLabelText("Search a subject to add to your priority list");
  await user.clear(search);
  await user.type(search, subjectId);
  await user.click(await screen.findByRole("button", { name: new RegExp(`${subjectId} ${titleWord}`) }));
}

describe("schedule lab page", () => {
  it("builds suggestions from a priority list and explains the overlap", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AppProvider>
          <MemoryRouter>
            <SchedulePage />
          </MemoryRouter>
        </AppProvider>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("Priority list")).toBeTruthy());

    await addSubject(user, "6.1200", "Mathematics");
    await addSubject(user, "18.06", "Linear");
    await addSubject(user, "6.1910", "Computation");

    // 6.1200 and 18.06 both meet Tuesday and Thursday afternoon.
    await waitFor(() => expect(screen.getByText("Overlaps in your list")).toBeTruthy());
    expect(screen.getByText("6.1200 vs 18.06")).toBeTruthy();

    expect(screen.getByText("Your priority order")).toBeTruthy();
    expect(document.querySelectorAll(".week-grid-block").length).toBeGreaterThan(0);

    const dropped = screen.getAllByText(/Left out:/);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped[0].textContent).toContain("18.06");
  });

  it("reports subjects that have no listed meeting times", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AppProvider>
          <MemoryRouter>
            <SchedulePage />
          </MemoryRouter>
        </AppProvider>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("Priority list")).toBeTruthy());
    await addSubject(user, "7.012", "Introductory");

    await waitFor(() => expect(screen.getByText("Not placeable")).toBeTruthy());
  });
});
