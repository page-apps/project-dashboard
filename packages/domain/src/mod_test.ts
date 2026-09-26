/// <reference lib="deno.ns" />

import { assertEquals, assertNotEquals } from "jsr:@std/assert@^1.0.15";

import {
  calculateMetrics,
  createMockDashboardData,
  filterRepositories,
  mockRepositories,
  sortRepositoriesByAttention,
} from "./mod.ts";

Deno.test("calculateMetrics counts dashboard attention correctly", () => {
  const dashboard = createMockDashboardData();

  assertEquals(dashboard.metrics, {
    pullRequestsNeedingReview: 2,
    failingWorkflows: 1,
    repositoriesAtRisk: 3,
    mergeConflicts: 1,
  });

  assertEquals(
    calculateMetrics(dashboard.pullRequests, dashboard.repositories, dashboard.workflows),
    dashboard.metrics,
  );
});

Deno.test("filterRepositories narrows by search term and group", () => {
  const filtered = filterRepositories(mockRepositories, {
    searchTerm: "front",
    group: "organization",
  });

  assertEquals(filtered.map((repository) => repository.fullName), ["org/frontend-app"]);
});

Deno.test("sortRepositoriesByAttention prioritizes the noisiest repos", () => {
  const sorted = sortRepositoriesByAttention(mockRepositories);

  assertEquals(sorted[0]?.fullName, "org/payments-service");
  assertNotEquals(sorted.at(-1)?.workflowState, "failing");
});
