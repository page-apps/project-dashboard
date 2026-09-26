import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createDefaultSettings, SETTINGS_STORAGE_KEY } from "./lib/settings.ts";
import { App } from "./App.tsx";

describe("dashboard application", () => {
  it("filters repositories from the dashboard screen", async () => {
    globalThis.location.hash = "#/dashboard";

    render(<App />);

    await screen.findByRole("heading", {
      level: 1,
      name: /repo attention across personal, org, and contributing projects/i,
    });

    const search = screen.getByLabelText(/search repository/i);

    await userEvent.type(search, "front");

    expect(screen.getByRole("link", { name: "org/frontend-app" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "org/payments-service" })).not.toBeInTheDocument();
  });

  it("navigates from the dashboard into repository detail", async () => {
    globalThis.location.hash = "#/dashboard";

    render(<App />);

    const repositoryLink = await screen.findByRole("link", { name: "org/frontend-app" });

    await userEvent.click(repositoryLink);

    expect(await screen.findByRole("heading", { level: 1, name: "org/frontend-app" }))
      .toBeInTheDocument();
    expect(screen.getByText(/central health view for pr velocity/i)).toBeInTheDocument();
  });

  it("persists settings changes", async () => {
    globalThis.location.hash = "#/settings";

    render(<App />);

    await screen.findByRole("heading", { level: 1, name: /tune default triage behavior/i });

    await userEvent.selectOptions(screen.getByLabelText(/theme/i, { selector: "select" }), "dark");

    expect(JSON.parse(globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}")).toMatchObject(
      {
        ...createDefaultSettings(),
        theme: "dark",
      },
    );
    expect(JSON.parse(globalThis.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}")).not.toHaveProperty("token");
  });
});
