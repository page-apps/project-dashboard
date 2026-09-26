import { expect, test } from "@playwright/test";

test("launcher and dashboard render the core flows", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: /manage personal and org github work/i }),
  ).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Dashboard" }).click();

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /repo attention across personal, org, and contributing projects/i,
    }),
  ).toBeVisible();

  await page.getByLabel("Search repository").fill("front");
  await expect(page.getByRole("link", { name: "org/frontend-app" })).toBeVisible();
  await expect(page.getByRole("link", { name: "org/payments-service" })).toHaveCount(0);
});

test("repository detail route is reachable from the dashboard", async ({ page }) => {
  await page.goto("/#/dashboard");

  await page.getByRole("link", { name: "org/frontend-app" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "org/frontend-app" })).toBeVisible();
  await expect(page.getByText(/central health view for pr velocity/i)).toBeVisible();
});
