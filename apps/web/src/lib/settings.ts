import type { RepoGroup } from "../../../../packages/domain/src/mod.ts";

export type ThemeMode = "system" | "light" | "dark";
export type DataSourceMode = "mock" | "live";
export type PullRequestCreatorFilter = "dependabot" | "all" | "me";
export type PullRequestSortOrder = "urgent" | "updated" | "created";
export type PullRequestStatusFilter = "all" | "mergeable" | "blocked" | "attention";
export type RepositorySortOrder = "attention" | "open-prs" | "updated";
export type WorkflowAlertThreshold = "failed" | "warn" | "all";

export interface AppSettings {
  readonly theme: ThemeMode;
  readonly dataSource: DataSourceMode;
  readonly repositorySearch: string;
  readonly repositoryGroup: RepoGroup | "all";
  readonly repositorySort: RepositorySortOrder;
  readonly includeArchivedRepositories: boolean;
  readonly pullRequestSearch: string;
  readonly pullRequestCreator: PullRequestCreatorFilter;
  readonly pullRequestStatus: PullRequestStatusFilter;
  readonly pullRequestSort: PullRequestSortOrder;
  readonly repositoryScope: RepoGroup | "all";
  readonly workflowAlertThreshold: WorkflowAlertThreshold;
}

export const SETTINGS_STORAGE_KEY = "project-dashboard.settings";
const LEGACY_STORAGE_KEYS = [
  "github-dashboard.settings",
  "github-dashboard.priority-repositories",
] as const;

export function createDefaultSettings(): AppSettings {
  return {
    theme: "system",
    dataSource: "mock",
    repositorySearch: "",
    repositoryGroup: "all",
    repositorySort: "attention",
    includeArchivedRepositories: false,
    pullRequestSearch: "",
    pullRequestCreator: "dependabot",
    pullRequestStatus: "all",
    pullRequestSort: "urgent",
    repositoryScope: "all",
    workflowAlertThreshold: "failed",
  };
}

export function loadSettings(): AppSettings {
  for (const key of LEGACY_STORAGE_KEYS) globalThis.localStorage?.removeItem(key);
  const defaults = createDefaultSettings();
  const rawValue = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);

  if (!rawValue) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AppSettings>;
    const { token: _legacyToken, ...safeSettings } = parsed as Partial<AppSettings> & { token?: unknown };

    return {
      ...defaults,
      ...safeSettings,
      repositorySearch: safeSettings.repositorySearch?.trim() ?? defaults.repositorySearch,
      pullRequestSearch: safeSettings.pullRequestSearch?.trim() ?? defaults.pullRequestSearch,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: AppSettings): void {
  globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function updateSettings(
  settings: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  return {
    ...settings,
    ...patch,
    repositorySearch: patch.repositorySearch?.trim() ?? settings.repositorySearch,
    pullRequestSearch: patch.pullRequestSearch?.trim() ?? settings.pullRequestSearch,
  };
}
