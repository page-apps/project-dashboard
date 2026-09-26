export type RepoGroup = "personal" | "organization" | "contributing";

export type ReviewState =
  | "draft"
  | "needs-review"
  | "changes-requested"
  | "ready-to-merge";

export type WorkflowState = "healthy" | "warning" | "failing";

export interface UserProfile {
  readonly login: string;
  readonly name: string;
  readonly avatarUrl: string;
}

export interface RepositorySummary {
  readonly id: string;
  readonly fullName: string;
  readonly name: string;
  readonly owner: string;
  readonly description: string;
  readonly topics: readonly string[];
  readonly group: RepoGroup;
  readonly primaryLanguage: string;
  readonly defaultBranch: string;
  readonly lastCommitAt: string;
  readonly openPrCount: number;
  readonly openIssueCount: number;
  readonly reviewRequests: number;
  readonly workflowState: WorkflowState;
  readonly stars: number;
  readonly archived: boolean;
}

export interface PullRequestSummary {
  readonly id: number;
  readonly repositoryFullName: string;
  readonly title: string;
  readonly number: number;
  readonly author: string;
  readonly updatedAt: string;
  readonly reviewState: ReviewState;
  readonly checksSummary: string;
  readonly labelNames: readonly string[];
  readonly draft: boolean;
  readonly mergeConflict: boolean;
  readonly url: string;
}

export interface WorkflowAlert {
  readonly id: string;
  readonly repositoryFullName: string;
  readonly workflowName: string;
  readonly branch: string;
  readonly status: WorkflowState;
  readonly summary: string;
  readonly updatedAt: string;
  readonly url: string;
}

export interface DashboardMetrics {
  readonly pullRequestsNeedingReview: number;
  readonly failingWorkflows: number;
  readonly repositoriesAtRisk: number;
  readonly mergeConflicts: number;
}

export interface DashboardData {
  readonly profile: UserProfile;
  readonly repositories: readonly RepositorySummary[];
  readonly pullRequests: readonly PullRequestSummary[];
  readonly workflows: readonly WorkflowAlert[];
  readonly metrics: DashboardMetrics;
  readonly generatedAt: string;
}

export interface RepositoryFilters {
  readonly searchTerm: string;
  readonly group: RepoGroup | "all";
}

export const mockRepositories: readonly RepositorySummary[] = [
  {
    id: "personal-notebook-api",
    fullName: "personal/notebook-api",
    name: "notebook-api",
    owner: "personal",
    description: "API powering note sync, sharing, and offline conflict resolution.",
    topics: ["api", "offline-first", "typescript"],
    group: "personal",
    primaryLanguage: "TypeScript",
    defaultBranch: "main",
    lastCommitAt: "2026-06-06T10:42:00Z",
    openPrCount: 2,
    openIssueCount: 5,
    reviewRequests: 1,
    workflowState: "warning",
    stars: 8,
    archived: false,
  },
  {
    id: "org-payments-service",
    fullName: "org/payments-service",
    name: "payments-service",
    owner: "org",
    description: "Handles billing events, invoice generation, and gateway webhooks.",
    topics: ["payments", "go", "backend"],
    group: "organization",
    primaryLanguage: "Go",
    defaultBranch: "main",
    lastCommitAt: "2026-06-05T21:16:00Z",
    openPrCount: 3,
    openIssueCount: 8,
    reviewRequests: 2,
    workflowState: "failing",
    stars: 124,
    archived: false,
  },
  {
    id: "oss-cache-layer",
    fullName: "oss/cache-layer",
    name: "cache-layer",
    owner: "oss",
    description: "An OSS cache orchestration library with Redis and SQLite adapters.",
    topics: ["cache", "redis", "sqlite", "rust"],
    group: "contributing",
    primaryLanguage: "Rust",
    defaultBranch: "main",
    lastCommitAt: "2026-06-04T08:03:00Z",
    openPrCount: 1,
    openIssueCount: 2,
    reviewRequests: 1,
    workflowState: "healthy",
    stars: 2031,
    archived: false,
  },
  {
    id: "org-frontend-app",
    fullName: "org/frontend-app",
    name: "frontend-app",
    owner: "org",
    description: "Customer-facing web app with feature flags, analytics, and checkout.",
    topics: ["web-app", "typescript", "analytics"],
    group: "organization",
    primaryLanguage: "TypeScript",
    defaultBranch: "main",
    lastCommitAt: "2026-06-06T09:12:00Z",
    openPrCount: 3,
    openIssueCount: 7,
    reviewRequests: 3,
    workflowState: "warning",
    stars: 93,
    archived: false,
  },
  {
    id: "personal-cli-tools",
    fullName: "personal/cli-tools",
    name: "cli-tools",
    owner: "personal",
    description: "A toolbox of scripts and Deno CLIs for project automation.",
    topics: ["cli", "deno", "automation"],
    group: "personal",
    primaryLanguage: "Deno",
    defaultBranch: "main",
    lastCommitAt: "2026-06-03T19:47:00Z",
    openPrCount: 0,
    openIssueCount: 1,
    reviewRequests: 0,
    workflowState: "healthy",
    stars: 15,
    archived: true,
  },
] as const;

export const mockPullRequests: readonly PullRequestSummary[] = [
  {
    id: 101,
    repositoryFullName: "personal/notebook-api",
    title: "Add optimistic note version reconciliation",
    number: 184,
    author: "cmwen",
    updatedAt: "2026-06-06T12:14:00Z",
    reviewState: "needs-review",
    checksSummary: "7/7 checks passing",
    labelNames: ["sync", "priority-high"],
    draft: false,
    mergeConflict: false,
    url: "https://github.com/personal/notebook-api/pull/184",
  },
  {
    id: 102,
    repositoryFullName: "org/payments-service",
    title: "Bump pg from 8.12.0 to 8.13.1",
    number: 928,
    author: "dependabot[bot]",
    updatedAt: "2026-06-05T23:48:00Z",
    reviewState: "changes-requested",
    checksSummary: "2 failing checks",
    labelNames: ["billing", "sre"],
    draft: false,
    mergeConflict: true,
    url: "https://github.com/org/payments-service/pull/928",
  },
  {
    id: 103,
    repositoryFullName: "org/frontend-app",
    title: "Bump vite-plugin-pwa from 1.0.0 to 1.0.1",
    number: 441,
    author: "dependabot[bot]",
    updatedAt: "2026-06-06T07:34:00Z",
    reviewState: "ready-to-merge",
    checksSummary: "All checks green",
    labelNames: ["frontend", "dependencies", "ready-to-merge"],
    draft: false,
    mergeConflict: false,
    url: "https://github.com/org/frontend-app/pull/441",
  },
  {
    id: 104,
    repositoryFullName: "oss/cache-layer",
    title: "Bump tokio from 1.44.0 to 1.45.1",
    number: 74,
    author: "dependabot[bot]",
    updatedAt: "2026-06-04T11:21:00Z",
    reviewState: "ready-to-merge",
    checksSummary: "All checks green",
    labelNames: ["dependencies", "ready-to-merge"],
    draft: false,
    mergeConflict: false,
    url: "https://github.com/oss/cache-layer/pull/74",
  },
  {
    id: 105,
    repositoryFullName: "org/frontend-app",
    title: "Investigate flaky onboarding analytics event",
    number: 438,
    author: "cmwen",
    updatedAt: "2026-06-06T05:01:00Z",
    reviewState: "draft",
    checksSummary: "Draft · 1 skipped workflow",
    labelNames: ["analytics", "investigation"],
    draft: true,
    mergeConflict: false,
    url: "https://github.com/org/frontend-app/pull/438",
  },
] as const;

export const mockWorkflows: readonly WorkflowAlert[] = [
  {
    id: "workflow-1",
    repositoryFullName: "org/payments-service",
    workflowName: "CI / Integration",
    branch: "main",
    status: "failing",
    summary: "Postgres-backed integration suite is timing out in staging.",
    updatedAt: "2026-06-06T00:18:00Z",
    url: "https://github.com/org/payments-service/actions/runs/1",
  },
  {
    id: "workflow-2",
    repositoryFullName: "org/frontend-app",
    workflowName: "Preview / VRT",
    branch: "main",
    status: "warning",
    summary: "One flaky snapshot is still retrying after merge queue rebases.",
    updatedAt: "2026-06-06T08:33:00Z",
    url: "https://github.com/org/frontend-app/actions/runs/2",
  },
  {
    id: "workflow-3",
    repositoryFullName: "personal/notebook-api",
    workflowName: "Release / Canary",
    branch: "main",
    status: "warning",
    summary: "Canary deploy is waiting on manual verification before promotion.",
    updatedAt: "2026-06-06T10:44:00Z",
    url: "https://github.com/personal/notebook-api/actions/runs/3",
  },
] as const;

export function calculateMetrics(
  pullRequests: readonly PullRequestSummary[],
  repositories: readonly RepositorySummary[],
  workflows: readonly WorkflowAlert[],
): DashboardMetrics {
  return {
    pullRequestsNeedingReview:
      pullRequests.filter((pullRequest) =>
        pullRequest.reviewState === "needs-review" ||
        pullRequest.reviewState === "changes-requested"
      ).length,
    failingWorkflows: workflows.filter((workflow) => workflow.status === "failing").length,
    repositoriesAtRisk: repositories.filter((repository) => repository.workflowState !== "healthy")
      .length,
    mergeConflicts: pullRequests.filter((pullRequest) => pullRequest.mergeConflict).length,
  };
}

export function createMockDashboardData(): DashboardData {
  return {
    profile: {
      login: "cmwen",
      name: "Chris Wen",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
    },
    repositories: sortRepositoriesByAttention(mockRepositories),
    pullRequests: mockPullRequests,
    workflows: mockWorkflows,
    metrics: calculateMetrics(mockPullRequests, mockRepositories, mockWorkflows),
    generatedAt: "2026-06-06T12:30:00Z",
  };
}

export function filterRepositories(
  repositories: readonly RepositorySummary[],
  filters: RepositoryFilters,
): readonly RepositorySummary[] {
  const normalizedSearch = filters.searchTerm.trim().toLowerCase();

  return repositories.filter((repository) => {
    const matchesSearch = normalizedSearch.length === 0 ||
      repository.fullName.toLowerCase().includes(normalizedSearch) ||
      repository.description.toLowerCase().includes(normalizedSearch) ||
      repository.primaryLanguage.toLowerCase().includes(normalizedSearch);

    const matchesGroup = filters.group === "all" || repository.group === filters.group;

    return matchesSearch && matchesGroup;
  });
}

export function getRepositoryByFullName(
  repositories: readonly RepositorySummary[],
  fullName: string,
): RepositorySummary | undefined {
  return repositories.find((repository) => repository.fullName === fullName);
}

export function sortRepositoriesByAttention(
  repositories: readonly RepositorySummary[],
): readonly RepositorySummary[] {
  return [...repositories].sort((left, right) => {
    const scoreDifference = computeAttentionScore(right) - computeAttentionScore(left);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return right.lastCommitAt.localeCompare(left.lastCommitAt);
  });
}

function computeAttentionScore(repository: RepositorySummary): number {
  const workflowWeight = repository.workflowState === "failing"
    ? 6
    : repository.workflowState === "warning"
    ? 3
    : 0;

  return workflowWeight + repository.reviewRequests * 2 + repository.openPrCount +
    repository.openIssueCount;
}
