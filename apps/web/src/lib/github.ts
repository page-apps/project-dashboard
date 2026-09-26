import { createAuthorizedGitHubClient, type AuthorizedGitHubClient } from "@repo-apps/authorized-github";
import type { CredentialProvider } from "@repo-apps/credentials";

import {
  calculateMetrics,
  createMockDashboardData,
  type DashboardData,
  type PullRequestSummary,
  type RepositorySummary,
  type ReviewState,
  sortRepositoriesByAttention,
  type WorkflowAlert,
  type WorkflowState,
} from "../../../../packages/domain/src/mod.ts";

import { logger } from "./logger.ts";
import type { AppSettings } from "./settings.ts";

export async function updateRepositoryTopics(
  settings: AppSettings,
  owner: string,
  repo: string,
  topics: readonly string[],
  credentials: CredentialProvider,
): Promise<void> {
  if (settings.dataSource !== "live") {
    throw new Error("Switch to Live GitHub API to edit repository topics.");
  }

  const octokit = createAuthorizedGitHubClient({ credentials });
  await octokit.request("PUT /repos/{owner}/{repo}/topics", {
    owner,
    repo,
    names: [
      ...new Set(
        topics.map((topic) => topic.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean),
      ),
    ],
  });
}

interface SearchIssueLabel {
  readonly name?: string | null;
}

interface GitHubRepositorySummary {
  readonly node_id: string;
  readonly full_name: string;
  readonly name: string;
  readonly owner: {
    readonly login: string;
    readonly type?: string | null;
  };
  readonly description?: string | null;
  readonly topics?: readonly string[] | null;
  readonly permissions?: {
    readonly admin?: boolean | null;
  } | null;
  readonly language?: string | null;
  readonly default_branch: string;
  readonly updated_at?: string | null;
  readonly created_at?: string | null;
  readonly open_issues_count: number;
  readonly stargazers_count: number;
  readonly archived?: boolean | null;
}

interface GitHubUserSummary {
  readonly login: string;
  readonly name?: string | null;
  readonly avatar_url?: string;
}

interface GitHubWorkflowRuns {
  readonly workflow_runs: readonly {
    readonly node_id: string;
    readonly conclusion?: string | null;
    readonly status?: string | null;
    readonly name?: string | null;
    readonly head_branch?: string | null;
    readonly display_title: string;
    readonly updated_at: string;
    readonly html_url: string;
  }[];
}

interface GitHubSearchIssuesResult {
  readonly items: readonly SearchPullRequestIssue[];
}

interface SearchPullRequestIssue {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly updated_at: string;
  readonly state: string;
  readonly html_url: string;
  readonly repository_url: string;
  readonly user?: {
    readonly login?: string;
  } | null;
  readonly labels: readonly SearchIssueLabel[];
  readonly draft?: boolean | null;
  readonly pull_request?: object;
}

interface ListPullRequestItem {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly updated_at: string;
  readonly html_url: string;
  readonly user?: {
    readonly login?: string;
  } | null;
  readonly labels?: readonly SearchIssueLabel[] | null;
  readonly draft?: boolean | null;
}

interface RepositoryCacheEntry extends RepositorySummary {
  readonly hits: number;
  readonly lastSeenAt: string;
}

interface RepositoryCacheFile {
  readonly version: 1;
  readonly repositories: readonly RepositoryCacheEntry[];
}

interface SearchOwnerScope {
  readonly qualifier: "user" | "org";
  readonly login: string;
}

const REPOSITORY_CACHE_STORAGE_KEY = "project-dashboard.priority-repositories";
const SEARCH_RESULTS_PER_PAGE = 100;
const SEARCH_PAGE_LIMIT_PER_OWNER = 3;
const SEARCH_OWNER_LIMIT = 24;
const SEED_REPOSITORY_LIMIT = 100;
const PRIORITY_REPOSITORY_LIMIT = 16;
const REPOSITORY_CACHE_LIMIT = 60;
const WORKFLOW_REPOSITORY_LIMIT = 8;
const REQUEST_CONCURRENCY = 4;

function withStatus(error: unknown): { status?: number } {
  return typeof error === "object" && error !== null ? error as { status?: number } : {};
}

export async function loadDashboardData(
  settings: AppSettings,
  credentials: CredentialProvider | null,
): Promise<DashboardData> {
  logger.info(
    {
      dataSource: settings.dataSource,
      repositoryScope: settings.repositoryScope,
      includeArchivedRepositories: settings.includeArchivedRepositories,
    },
    "Loading dashboard data",
  );

  if (settings.dataSource === "mock") {
    return applyRepositoryScope(createMockDashboardData(), settings);
  }

  if (!credentials) {
    throw new Error("A GitHub token is required before live mode can be enabled.");
  }

  return await loadLiveDashboardData(settings, credentials);
}

async function loadLiveDashboardData(
  settings: AppSettings,
  credentials: CredentialProvider,
): Promise<DashboardData> {
  const octokit = createAuthorizedGitHubClient({ credentials });
  const cachedRepositories = loadPriorityRepositoryCache();
  const { data: viewer } = await octokit.request<GitHubUserSummary>("GET /user");
  const [{ data: repositoriesResponse }, organizationLogins] = await Promise.all([
    octokit.request<GitHubRepositorySummary[]>("GET /user/repos", {
      sort: "updated",
      affiliation: "owner,collaborator,organization_member",
      per_page: SEED_REPOSITORY_LIMIT,
    }),
    readOrganizationLogins(octokit),
  ]);

  const seedRepositories = repositoriesResponse.map((repository) =>
    mapRepositorySummary(repository, new Map())
  );
  const ownerScopes = buildOwnerSearchScopes(
    viewer.login,
    organizationLogins,
    seedRepositories,
    cachedRepositories,
  );
  const priorityRepositoryNames = selectPriorityRepositoryNames(
    seedRepositories,
    cachedRepositories,
  );
  const [priorityPullRequests, searchPullRequests] = await Promise.all([
    readPriorityRepositoryPullRequests(octokit, priorityRepositoryNames),
    searchDependabotPullRequests(octokit, ownerScopes),
  ]);
  const pullRequests = dedupePullRequests([...priorityPullRequests, ...searchPullRequests]);

  const pullRequestCounts = new Map<string, number>();
  for (const pullRequest of pullRequests) {
    pullRequestCounts.set(
      pullRequest.repositoryFullName,
      (pullRequestCounts.get(pullRequest.repositoryFullName) ?? 0) + 1,
    );
  }

  const repositoryByFullName = new Map<string, RepositorySummary>();
  for (const repository of cachedRepositories) {
    repositoryByFullName.set(repository.fullName, repository);
  }
  for (const repository of seedRepositories) {
    repositoryByFullName.set(repository.fullName, repository);
  }

  const missingPullRequestRepositoryNames = [
    ...new Set(
      pullRequests
        .map((pullRequest) => pullRequest.repositoryFullName)
        .filter((repositoryFullName) => !repositoryByFullName.has(repositoryFullName)),
    ),
  ];
  const pullRequestRepositories = await readRepositoriesByFullName(
    octokit,
    missingPullRequestRepositoryNames,
    pullRequestCounts,
  );
  for (const repository of pullRequestRepositories) {
    repositoryByFullName.set(repository.fullName, repository);
  }

  const repositories = [...repositoryByFullName.values()].map((repository) => ({
    ...repository,
    openPrCount: pullRequestCounts.get(repository.fullName) ?? repository.openPrCount,
    reviewRequests: pullRequestCounts.get(repository.fullName) ?? repository.reviewRequests,
  }));

  const scopedRepositories = filterRepositoriesByScope(
    repositories,
    settings.repositoryScope,
    settings.includeArchivedRepositories,
  );
  const scopedRepositoryNames = new Set(
    scopedRepositories.map((repository) => repository.fullName),
  );
  const scopedPullRequests = pullRequests.filter((pullRequest) =>
    scopedRepositoryNames.has(pullRequest.repositoryFullName)
  );
  const workflows = (
    await Promise.all(
      scopedRepositories.slice(0, WORKFLOW_REPOSITORY_LIMIT).map((repository) =>
        readWorkflowAlert(octokit, repository.owner, repository.name, repository.fullName)
      ),
    )
  ).filter((workflow): workflow is WorkflowAlert => workflow !== undefined);

  const workflowByRepository = new Map(
    workflows.map((workflow) => [workflow.repositoryFullName, workflow.status] as const),
  );

  const enrichedRepositories = scopedRepositories.map((repository) => ({
    ...repository,
    workflowState: workflowByRepository.get(repository.fullName) ?? "healthy",
  }));

  savePriorityRepositoryCache(repositories, pullRequests, cachedRepositories);

  return {
    profile: {
      login: viewer.login,
      name: viewer.name ?? viewer.login,
      avatarUrl: viewer.avatar_url ?? "",
    },
    repositories: sortRepositoriesByAttention(enrichedRepositories),
    pullRequests: scopedPullRequests,
    workflows,
    metrics: calculateMetrics(scopedPullRequests, enrichedRepositories, workflows),
    generatedAt: new Date().toISOString(),
  };
}

export async function mergePullRequest(
  settings: AppSettings,
  pullRequest: PullRequestSummary,
  credentials: CredentialProvider,
): Promise<void> {
  if (settings.dataSource !== "live") {
    throw new Error("A GitHub token is required before pull requests can be merged.");
  }

  const [owner, repo] = pullRequest.repositoryFullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Cannot merge PR from invalid repository '${pullRequest.repositoryFullName}'.`);
  }

  const octokit = createAuthorizedGitHubClient({ credentials });
  await octokit.request("PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge", {
    owner,
    repo,
    pull_number: pullRequest.number,
  });
}

async function readOrganizationLogins(octokit: AuthorizedGitHubClient): Promise<readonly string[]> {
  try {
    const { data } = await octokit.request<{ readonly login: string }[]>("GET /user/orgs", {
      per_page: 100,
    });

    return data.map((organization) => organization.login);
  } catch (error) {
    const { status } = withStatus(error);

    if (status === 403 || status === 404) {
      return [];
    }

    throw error;
  }
}

function buildOwnerSearchScopes(
  viewerLogin: string,
  organizationLogins: readonly string[],
  seedRepositories: readonly RepositorySummary[],
  cachedRepositories: readonly RepositoryCacheEntry[],
): readonly SearchOwnerScope[] {
  const orgScores = new Map<string, number>();
  for (const repository of seedRepositories) {
    if (repository.group === "organization") {
      orgScores.set(repository.owner, (orgScores.get(repository.owner) ?? 0) + 1);
    }
  }
  for (const repository of cachedRepositories) {
    if (repository.owner !== viewerLogin) {
      orgScores.set(repository.owner, (orgScores.get(repository.owner) ?? 0) + repository.hits);
    }
  }
  for (const organizationLogin of organizationLogins) {
    orgScores.set(organizationLogin, orgScores.get(organizationLogin) ?? 0);
  }

  const organizationScopes = [...orgScores.entries()]
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([login]): SearchOwnerScope => ({ qualifier: "org", login }));
  const scopes: SearchOwnerScope[] = [
    { qualifier: "user", login: viewerLogin },
    ...organizationScopes,
  ];

  if (scopes.length > SEARCH_OWNER_LIMIT) {
    logger.warn(
      {
        searchedOwners: SEARCH_OWNER_LIMIT,
        availableOwners: scopes.length,
      },
      "Limiting Dependabot owner searches to avoid GitHub search rate limits",
    );
  }

  return scopes.slice(0, SEARCH_OWNER_LIMIT);
}

function selectPriorityRepositoryNames(
  seedRepositories: readonly RepositorySummary[],
  cachedRepositories: readonly RepositoryCacheEntry[],
): readonly string[] {
  const repositoryNames = new Set<string>();
  for (const repository of cachedRepositories) {
    repositoryNames.add(repository.fullName);
  }
  for (const repository of seedRepositories) {
    repositoryNames.add(repository.fullName);
  }

  return [...repositoryNames].slice(0, PRIORITY_REPOSITORY_LIMIT);
}

async function readPriorityRepositoryPullRequests(
  octokit: AuthorizedGitHubClient,
  repositoryFullNames: readonly string[],
): Promise<readonly PullRequestSummary[]> {
  const pullRequestGroups = await mapWithConcurrency(
    repositoryFullNames,
    REQUEST_CONCURRENCY,
    async (repositoryFullName) => {
      const [owner, repo] = repositoryFullName.split("/");

      if (!owner || !repo) {
        return [];
      }

      try {
        const { data } = await octokit.request<ListPullRequestItem[]>("GET /repos/{owner}/{repo}/pulls", {
          owner,
          repo,
          state: "open",
          per_page: 100,
        });

        return (data as readonly ListPullRequestItem[])
          .filter((item) => isDependabotAuthor(item.user?.login ?? ""))
          .map((item) => mapPullRequestFromRepositoryPull(repositoryFullName, item));
      } catch (error) {
        const { status } = withStatus(error);

        if (status === 403 || status === 404) {
          return [];
        }

        throw error;
      }
    },
  );

  return pullRequestGroups.flat();
}

async function searchDependabotPullRequests(
  octokit: AuthorizedGitHubClient,
  ownerScopes: readonly SearchOwnerScope[],
): Promise<readonly PullRequestSummary[]> {
  const pullRequests: PullRequestSummary[] = [];

  for (const scope of ownerScopes) {
    for (let page = 1; page <= SEARCH_PAGE_LIMIT_PER_OWNER; page += 1) {
      const { data } = await octokit.request<GitHubSearchIssuesResult>("GET /search/issues", {
        q: `is:pr is:open archived:false author:app/dependabot ${scope.qualifier}:${scope.login}`,
        sort: "updated",
        order: "desc",
        per_page: SEARCH_RESULTS_PER_PAGE,
        page,
      });
      const pagePullRequests = data.items
        .filter((item) => !!item.pull_request)
        .map((item) => mapPullRequest(item));

      pullRequests.push(...pagePullRequests);

      if (pagePullRequests.length < SEARCH_RESULTS_PER_PAGE) {
        break;
      }
    }
  }

  return pullRequests;
}

async function readRepositoriesByFullName(
  octokit: AuthorizedGitHubClient,
  repositoryFullNames: readonly string[],
  pullRequestCounts: ReadonlyMap<string, number>,
): Promise<readonly RepositorySummary[]> {
  return await mapWithConcurrency(
    repositoryFullNames,
    REQUEST_CONCURRENCY,
    async (repositoryFullName) => {
      const [owner, repo] = repositoryFullName.split("/");

      if (!owner || !repo) {
        return undefined;
      }

      try {
        const { data } = await octokit.request<GitHubRepositorySummary>("GET /repos/{owner}/{repo}", {
          owner,
          repo,
        });

        return mapRepositorySummary(data, pullRequestCounts);
      } catch (error) {
        const { status } = withStatus(error);

        if (status === 403 || status === 404) {
          return undefined;
        }

        throw error;
      }
    },
  ).then((repositories) =>
    repositories.filter((repository): repository is RepositorySummary => repository !== undefined)
  );
}

async function readWorkflowAlert(
  octokit: AuthorizedGitHubClient,
  owner: string,
  repo: string,
  fullName: string,
): Promise<WorkflowAlert | undefined> {
  try {
    const { data } = await octokit.request<GitHubWorkflowRuns>("GET /repos/{owner}/{repo}/actions/runs", {
      owner,
      repo,
      per_page: 1,
    });
    const latestRun = data.workflow_runs[0];

    if (!latestRun) {
      return undefined;
    }

    const status = mapWorkflowState(latestRun.conclusion ?? null, latestRun.status ?? "queued");

    if (status === "healthy") {
      return undefined;
    }

    return {
      id: latestRun.node_id,
      repositoryFullName: fullName,
      workflowName: latestRun.name ?? "GitHub Actions",
      branch: latestRun.head_branch ?? "unknown",
      status,
      summary: latestRun.display_title,
      updatedAt: latestRun.updated_at,
      url: latestRun.html_url,
    };
  } catch (error) {
    const { status } = withStatus(error);

    if (status === 403 || status === 404) {
      return undefined;
    }

    throw error;
  }
}

function parseRepositoryFullName(repositoryUrl: string): string {
  return repositoryUrl.replace("https://api.github.com/repos/", "");
}

function mapRepositorySummary(
  repository: GitHubRepositorySummary,
  pullRequestCounts: ReadonlyMap<string, number>,
): RepositorySummary {
  const openPrCount = pullRequestCounts.get(repository.full_name) ?? 0;
  const approximateOpenIssues = Math.max(repository.open_issues_count - openPrCount, 0);

  return {
    id: repository.node_id,
    fullName: repository.full_name,
    name: repository.name,
    owner: repository.owner.login,
    description: repository.description ?? "No description provided.",
    topics: repository.topics ?? [],
    group: repository.owner.type === "Organization"
      ? "organization"
      : repository.permissions?.admin
      ? "personal"
      : "contributing",
    primaryLanguage: repository.language ?? "Mixed",
    defaultBranch: repository.default_branch,
    lastCommitAt: repository.updated_at ?? repository.created_at ?? new Date().toISOString(),
    openPrCount,
    openIssueCount: approximateOpenIssues,
    reviewRequests: openPrCount,
    workflowState: "healthy",
    stars: repository.stargazers_count,
    archived: repository.archived ?? false,
  };
}

function mapPullRequest(item: SearchPullRequestIssue): PullRequestSummary {
  const labels = item.labels.flatMap((label) => label.name ? [label.name] : []);
  const titleLowerCase = item.title.toLowerCase();

  return {
    id: item.id,
    repositoryFullName: parseRepositoryFullName(item.repository_url),
    title: item.title,
    number: item.number,
    author: item.user?.login ?? "unknown",
    updatedAt: item.updated_at,
    reviewState: deriveReviewState(labels, item.draft ?? false, titleLowerCase),
    checksSummary: labels.includes("ci-failing")
      ? "Checks require attention"
      : labels.includes("ready-to-merge")
      ? "Ready to merge"
      : "Review activity available in GitHub",
    labelNames: labels,
    draft: item.draft ?? false,
    mergeConflict: labels.includes("merge-conflict") || titleLowerCase.includes("conflict"),
    url: item.html_url,
  };
}

function mapPullRequestFromRepositoryPull(
  repositoryFullName: string,
  item: ListPullRequestItem,
): PullRequestSummary {
  const labels = (item.labels ?? []).flatMap((label) => label.name ? [label.name] : []);
  const titleLowerCase = item.title.toLowerCase();

  return {
    id: item.id,
    repositoryFullName,
    title: item.title,
    number: item.number,
    author: item.user?.login ?? "unknown",
    updatedAt: item.updated_at,
    reviewState: deriveReviewState(labels, item.draft ?? false, titleLowerCase),
    checksSummary: labels.includes("ci-failing")
      ? "Checks require attention"
      : labels.includes("ready-to-merge")
      ? "Ready to merge"
      : "Review activity available in GitHub",
    labelNames: labels,
    draft: item.draft ?? false,
    mergeConflict: labels.includes("merge-conflict") || titleLowerCase.includes("conflict"),
    url: item.html_url,
  };
}

function isDependabotAuthor(author: string): boolean {
  return author.toLowerCase().includes("dependabot");
}

function dedupePullRequests(
  pullRequests: readonly PullRequestSummary[],
): readonly PullRequestSummary[] {
  const pullRequestById = new Map<number, PullRequestSummary>();
  for (const pullRequest of pullRequests) {
    pullRequestById.set(pullRequest.id, pullRequest);
  }

  return [...pullRequestById.values()].toSorted((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function loadPriorityRepositoryCache(): readonly RepositoryCacheEntry[] {
  const rawValue = globalThis.localStorage?.getItem(REPOSITORY_CACHE_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<RepositoryCacheFile>;

    if (parsed.version !== 1 || !Array.isArray(parsed.repositories)) {
      return [];
    }

    return parsed.repositories
      .filter(isRepositoryCacheEntry)
      .toSorted(compareRepositoryCacheEntries)
      .slice(0, REPOSITORY_CACHE_LIMIT);
  } catch {
    return [];
  }
}

function savePriorityRepositoryCache(
  repositories: readonly RepositorySummary[],
  pullRequests: readonly PullRequestSummary[],
  cachedRepositories: readonly RepositoryCacheEntry[],
): void {
  const now = new Date().toISOString();
  const repositoryByFullName = new Map<string, RepositoryCacheEntry>();

  for (const repository of cachedRepositories) {
    repositoryByFullName.set(repository.fullName, repository);
  }
  for (const repository of repositories) {
    const cachedRepository = repositoryByFullName.get(repository.fullName);
    repositoryByFullName.set(repository.fullName, {
      ...repository,
      hits: cachedRepository?.hits ?? 0,
      lastSeenAt: cachedRepository?.lastSeenAt ?? now,
    });
  }
  for (const pullRequest of pullRequests) {
    const repository = repositoryByFullName.get(pullRequest.repositoryFullName);

    if (!repository) {
      continue;
    }

    repositoryByFullName.set(repository.fullName, {
      ...repository,
      hits: repository.hits + 1,
      lastSeenAt: now,
    });
  }

  const cacheFile: RepositoryCacheFile = {
    version: 1,
    repositories: [...repositoryByFullName.values()]
      .toSorted(compareRepositoryCacheEntries)
      .slice(0, REPOSITORY_CACHE_LIMIT),
  };

  globalThis.localStorage?.setItem(REPOSITORY_CACHE_STORAGE_KEY, JSON.stringify(cacheFile));
}

function isRepositoryCacheEntry(value: unknown): value is RepositoryCacheEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const repository = value as Partial<RepositoryCacheEntry>;

  return typeof repository.fullName === "string" &&
    typeof repository.name === "string" &&
    typeof repository.owner === "string" &&
    typeof repository.hits === "number" &&
    typeof repository.lastSeenAt === "string";
}

function compareRepositoryCacheEntries(
  left: RepositoryCacheEntry,
  right: RepositoryCacheEntry,
): number {
  return right.hits - left.hits ||
    right.openPrCount - left.openPrCount ||
    right.lastSeenAt.localeCompare(left.lastSeenAt) ||
    left.fullName.localeCompare(right.fullName);
}

function deriveReviewState(
  labels: readonly string[],
  isDraft: boolean,
  titleLowerCase: string,
): ReviewState {
  if (isDraft) {
    return "draft";
  }

  if (labels.includes("changes-requested") || titleLowerCase.includes("follow-up")) {
    return "changes-requested";
  }

  if (labels.includes("ready-to-merge") || labels.includes("approved")) {
    return "ready-to-merge";
  }

  return "needs-review";
}

function mapWorkflowState(
  conclusion: string | null,
  status: string,
): WorkflowState {
  if (status !== "completed") {
    return "warning";
  }

  if (conclusion === "success") {
    return "healthy";
  }

  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled") {
    return "failing";
  }

  return "warning";
}

function applyRepositoryScope(data: DashboardData, settings: AppSettings): DashboardData {
  const repositories = filterRepositoriesByScope(
    data.repositories,
    settings.repositoryScope,
    settings.includeArchivedRepositories,
  );
  const repositoryNames = new Set(repositories.map((repository) => repository.fullName));
  const pullRequests = data.pullRequests.filter((pullRequest) =>
    repositoryNames.has(pullRequest.repositoryFullName)
  );
  const workflows = data.workflows.filter((workflow) =>
    repositoryNames.has(workflow.repositoryFullName)
  );

  return {
    ...data,
    repositories,
    pullRequests,
    workflows,
    metrics: calculateMetrics(pullRequests, repositories, workflows),
  };
}

function filterRepositoriesByScope(
  repositories: readonly RepositorySummary[],
  scope: AppSettings["repositoryScope"],
  includeArchivedRepositories: boolean,
): readonly RepositorySummary[] {
  const visibleRepositories = includeArchivedRepositories
    ? repositories
    : repositories.filter((repository) => !repository.archived);

  if (scope === "all") {
    return visibleRepositories;
  }

  return visibleRepositories.filter((repository) => repository.group === scope);
}
