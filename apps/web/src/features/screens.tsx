import React, { useMemo, useState } from "react";
import {
  type DashboardData,
  filterRepositories,
  getRepositoryByFullName,
  type PullRequestSummary,
  type RepositorySummary,
  type WorkflowState,
} from "../../../../packages/domain/src/mod.ts";
import { Link, useParams } from "react-router-dom";
import { SECURITY_DISCLOSURE } from "@repo-apps/ui";

import { StatusPill } from "../components/StatusPill.tsx";
import { logger } from "../lib/logger.ts";
import type {
  AppSettings,
  DataSourceMode,
  PullRequestCreatorFilter,
  PullRequestSortOrder,
  PullRequestStatusFilter,
  RepositorySortOrder,
  ThemeMode,
  WorkflowAlertThreshold,
} from "../lib/settings.ts";
import { formatDateTime } from "../lib/time.ts";

export interface ScreenState {
  readonly isLoading: boolean;
  readonly errorMessage?: string;
}

export interface DashboardScreenProps {
  readonly data?: DashboardData;
  readonly settings: AppSettings;
  readonly onUpdateSettings: (patch: Partial<AppSettings>) => void;
  readonly onSaveTopics: (owner: string, repo: string, topics: readonly string[]) => Promise<void>;
  readonly topicsEditable: boolean;
  readonly state: ScreenState;
}

export interface SharedScreenProps {
  readonly data?: DashboardData;
  readonly state: ScreenState;
}

export interface PullRequestsScreenProps extends SharedScreenProps {
  readonly settings: AppSettings;
  readonly onUpdateSettings: (patch: Partial<AppSettings>) => void;
  readonly onMergePullRequest: (pullRequest: PullRequestSummary) => Promise<void>;
}

export interface WorkflowsScreenProps extends SharedScreenProps {
  readonly settings: AppSettings;
  readonly onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export interface SettingsScreenProps {
  readonly settings: AppSettings;
  readonly onUpdateSettings: (patch: Partial<AppSettings>) => void;
  readonly onResetSettings: () => void;
  readonly credentialReady: boolean;
  readonly connectedAccount?: string;
  readonly hasSharedCredential: boolean;
  readonly onConnectWithPat: (token: string) => Promise<void>;
  readonly onConnectWithSharedPat: () => Promise<void>;
  readonly onDisconnectPat: () => Promise<void>;
}

type RepositoryDetailTab = "prs" | "issues" | "workflows";
type MergeOutcome = "merged" | "failed" | "skipped";

interface MergeResult {
  readonly pullRequestId: number;
  readonly title: string;
  readonly repositoryFullName: string;
  readonly outcome: MergeOutcome;
  readonly message: string;
}

export function LauncherScreen({ data, state }: SharedScreenProps) {
  return (
    <section className="screen">
      <section className="container page-section">
        <p className="eyebrow">responsive web prototype</p>
        <h1>Manage personal and org GitHub work from one operational surface.</h1>
        <p className="lead">
          This dashboard includes dedicated screens for repo attention, PR triage, workflow
          failures, repository-level detail, and live GitHub data through the App Framework client.
        </p>
      </section>

      <section className="container page-section">
        <div className="grid-3">
          <QuickLinkCard
            description="My repos, org repos, contributing repos, and attention signals."
            href="/dashboard"
            label="screen 01"
            title="Dashboard"
          />
          <QuickLinkCard
            description="Creator filter defaults, urgency behavior, scope controls, and logging."
            href="/settings"
            label="screen 02"
            title="Settings / Filters"
          />
          <QuickLinkCard
            description="Dependabot default focus, urgent-first sort, and merge controls."
            href="/pull-requests"
            label="screen 03"
            title="Pull Requests Hub"
          />
          <QuickLinkCard
            description="Failed builds and conflicting checks across all repositories."
            href="/workflows"
            label="screen 04"
            title="Workflow Alerts"
          />
          <QuickLinkCard
            description="Focused repo view with branch health, PR queue, and issue load."
            href="/repositories/org/frontend-app"
            label="screen 05"
            title="Repository Detail"
          />
        </div>
      </section>

      {data && (
        <section className="container page-section">
          <div className="grid-4">
            <MetricCard
              label="Open PRs needing review"
              value={String(data.metrics.pullRequestsNeedingReview)}
            />
            <MetricCard label="Failing workflows" value={String(data.metrics.failingWorkflows)} />
            <MetricCard
              label="Repositories at risk"
              value={String(data.metrics.repositoriesAtRisk)}
            />
            <MetricCard
              label="Merge conflicts detected"
              value={String(data.metrics.mergeConflicts)}
            />
          </div>
          <DataStateNotice state={state} />
        </section>
      )}

      <ScreenFooter
        ctaLabel="Open Dashboard →"
        ctaTo="/dashboard"
        note="Prototype scope: responsive web · PWA · mock and live GitHub modes"
      />
    </section>
  );
}

export function DashboardScreen({
  data,
  onSaveTopics,
  onUpdateSettings,
  settings,
  state,
  topicsEditable,
}: DashboardScreenProps) {
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [groupByTopic, setGroupByTopic] = useState(false);
  const [editingRepository, setEditingRepository] = useState<string>();
  const [draftTopics, setDraftTopics] = useState("");
  const [topicSaveError, setTopicSaveError] = useState<string>();
  const [savingTopics, setSavingTopics] = useState(false);
  const allTopics = [
    ...new Set((data?.repositories ?? []).flatMap((repository) => repository.topics)),
  ]
    .toSorted((a, b) => a.localeCompare(b));
  const repositories = data
    ? sortRepositoriesForDashboard(
      filterRepositories(data.repositories, {
        searchTerm: settings.repositorySearch,
        group: settings.repositoryGroup,
      }).filter((repository) =>
        selectedTopic === "all" || repository.topics.includes(selectedTopic)
      ),
      settings.repositorySort,
    )
    : [];
  const visibleOpenPullRequests = repositories.reduce(
    (total, repository) => total + repository.openPrCount,
    0,
  );
  const visibleFailingRepositories =
    repositories.filter((repository) => repository.workflowState === "failing").length;
  const visibleArchivedRepositories = repositories.filter((repository) => repository.archived)
    .length;

  async function saveTopics(owner: string, repo: string) {
    setSavingTopics(true);
    setTopicSaveError(undefined);
    try {
      await onSaveTopics(
        owner,
        repo,
        draftTopics.split(",").map((topic) => topic.trim()).filter(Boolean),
      );
      setEditingRepository(undefined);
    } catch (error) {
      setTopicSaveError(
        error instanceof Error ? error.message : "Could not update repository topics.",
      );
    } finally {
      setSavingTopics(false);
    }
  }

  const displayedGroups = groupByTopic
    ? [
      ...allTopics.filter((topic) => selectedTopic === "all" || selectedTopic === topic)
        .map((topic) => ({
          topic,
          repositories: repositories.filter((repository) => repository.topics.includes(topic)),
        }))
        .filter((group) => group.repositories.length > 0),
      ...(selectedTopic === "all"
        ? [{
          topic: "No topics",
          repositories: repositories.filter((repository) => repository.topics.length === 0),
        }]
        : []),
    ].filter((group) => group.repositories.length > 0)
    : [{ topic: "", repositories }];

  return (
    <section className="screen">
      <section className="container page-section">
        <div className="row-between">
          <div>
            <p className="eyebrow">dashboard</p>
            <h1>Repo attention across personal, org, and contributing projects.</h1>
          </div>
        </div>
        <div className="summary-strip" aria-label="Visible repository summary">
          <MetricCard label="Visible repos" value={String(repositories.length)} />
          <MetricCard label="Open PRs in view" value={String(visibleOpenPullRequests)} />
          <MetricCard label="Failing repos" value={String(visibleFailingRepositories)} />
          <MetricCard label="Archived included" value={String(visibleArchivedRepositories)} />
        </div>
        <div className="toolbar toolbar--with-margin" aria-label="Repository filters">
          <div className="field">
            <label className="label" htmlFor="repo-search">Search repository</label>
            <input
              id="repo-search"
              type="search"
              placeholder="repo name…"
              value={settings.repositorySearch}
              onChange={(event) =>
                onUpdateSettings({ repositorySearch: event.currentTarget.value })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="repo-topic-filter">Repository label (topic)</label>
            <select
              id="repo-topic-filter"
              value={selectedTopic}
              onChange={(event) => setSelectedTopic(event.currentTarget.value)}
            >
              <option value="all">
                All repository labels ({data?.repositories.length ?? 0} repositories)
              </option>
              {allTopics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}{" "}
                  ({data?.repositories.filter((repository) => repository.topics.includes(topic))
                    .length})
                </option>
              ))}
            </select>
          </div>
          <label className="topic-group-toggle">
            <input
              type="checkbox"
              checked={groupByTopic}
              onChange={(event) => setGroupByTopic(event.currentTarget.checked)}
            />{" "}
            Group by label
          </label>
          <div className="field">
            <label className="label" htmlFor="repo-group">Group</label>
            <select
              id="repo-group"
              value={settings.repositoryGroup}
              onChange={(event) =>
                onUpdateSettings({
                  repositoryGroup: event.currentTarget.value as AppSettings["repositoryGroup"],
                })}
            >
              <option value="all">All groups</option>
              <option value="personal">My repos</option>
              <option value="organization">Org repos</option>
              <option value="contributing">Contributing repos</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="repo-sort">Sort by</label>
            <select
              id="repo-sort"
              value={settings.repositorySort}
              onChange={(event) =>
                onUpdateSettings({
                  repositorySort: event.currentTarget.value as RepositorySortOrder,
                })}
            >
              <option value="attention">Attention needed</option>
              <option value="open-prs">Open PR count</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.includeArchivedRepositories}
              onChange={(event) =>
                onUpdateSettings({ includeArchivedRepositories: event.currentTarget.checked })}
            />
            Include archived repos
          </label>
        </div>
        {!topicsEditable && (
          <p className="topic-help">
            Connect a GitHub token and select Live GitHub API in Settings to add or remove
            repository labels (GitHub topics).
          </p>
        )}
      </section>

      {data && (
        <section className="container page-section">
          <div className="grid-4">
            <MetricCard
              label="Open PRs needing review"
              value={String(data.metrics.pullRequestsNeedingReview)}
            />
            <MetricCard label="Failing workflows" value={String(data.metrics.failingWorkflows)} />
            <MetricCard label="Open issues assigned" value={String(countOpenIssues(data))} />
            <MetricCard
              label="Merge conflicts detected"
              value={String(data.metrics.mergeConflicts)}
            />
          </div>
        </section>
      )}

      <section className="container page-section">
        <DataStateNotice state={state} />
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Attention</th>
                <th>Group</th>
                <th>Latest commit</th>
                <th>Open PRs</th>
                <th>Open issues</th>
                <th>Repository labels</th>
                <th>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {repositories.length === 0
                ? (
                  <tr>
                    <td className="empty" colSpan={8}>No repositories match this filter.</td>
                  </tr>
                )
                : displayedGroups.flatMap((group) => [
                  ...(group.topic
                    ? [
                      <tr className="topic-group-heading" key={`topic-${group.topic}`}>
                        <th colSpan={8}>
                          {group.topic} <span>{group.repositories.length} repositories</span>
                        </th>
                      </tr>,
                    ]
                    : []),
                  ...group.repositories.map((repository) => (
                    <React.Fragment key={repository.id}>
                      <tr className={repository.archived ? "row-muted" : undefined}>
                        <td>
                          <Link
                            className="inline-link"
                            to={`/repositories/${repository.owner}/${repository.name}`}
                          >
                            {repository.fullName}
                          </Link>
                          {repository.archived && <span className="subtle-row-note">Archived</span>}
                        </td>
                        <td>{renderRepositoryAttention(repository)}</td>
                        <td>{formatGroup(repository.group)}</td>
                        <td className="mono">{formatDateTime(repository.lastCommitAt)}</td>
                        <td className="mono">{repository.openPrCount}</td>
                        <td className="mono">{repository.openIssueCount}</td>
                        <td>
                          <div className="topic-list">
                            {repository.topics.length
                              ? repository.topics.map((topic) => (
                                <button
                                  className="topic-chip"
                                  key={topic}
                                  type="button"
                                  onClick={() => setSelectedTopic(topic)}
                                >
                                  {topic}
                                </button>
                              ))
                              : <span className="muted">No topics</span>}
                            <button
                              className="topic-edit-link"
                              type="button"
                              disabled={!topicsEditable}
                              title={topicsEditable
                                ? "Edit repository labels"
                                : "Connect a token in Settings to edit repository labels"}
                              onClick={() => {
                                setEditingRepository(repository.fullName);
                                setDraftTopics(repository.topics.join(", "));
                                setTopicSaveError(undefined);
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                        <td>
                          <StatusPill tone={mapWorkflowTone(repository.workflowState)}>
                            {formatRepositoryWorkflowLabel(repository.workflowState)}
                          </StatusPill>
                        </td>
                      </tr>
                      {editingRepository === repository.fullName && (
                        <tr>
                          <td colSpan={8}>
                            <div className="topic-editor">
                              <label className="label" htmlFor={`topics-${repository.id}`}>
                                Repository labels (GitHub topics), separated by commas
                              </label>
                              <input
                                id={`topics-${repository.id}`}
                                value={draftTopics}
                                onChange={(event) => setDraftTopics(event.currentTarget.value)}
                                placeholder="ai, local-first, typescript"
                              />
                              <div className="topic-editor__actions">
                                <span className="muted">
                                  Labels are saved as GitHub repository topics. Use lowercase;
                                  spaces become hyphens.
                                </span>
                                <button
                                  className="btn btn-primary"
                                  type="button"
                                  disabled={savingTopics || !topicsEditable}
                                  onClick={() => void saveTopics(repository.owner, repository.name)}
                                >
                                  {savingTopics ? "Saving…" : "Save labels"}
                                </button>
                                <button
                                  className="btn"
                                  type="button"
                                  disabled={savingTopics}
                                  onClick={() => setEditingRepository(undefined)}
                                >
                                  Cancel
                                </button>
                              </div>
                              {topicSaveError && (
                                <p className="form-error" role="alert">{topicSaveError}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )),
                ])}
            </tbody>
          </table>
        </div>
      </section>

      <ScreenFooter
        ctaLabel="Go to PR Hub →"
        ctaTo="/pull-requests"
        note="Tip: open PR Hub to merge Dependabot updates in one flow."
      />
    </section>
  );
}

export function PullRequestsScreen({
  data,
  onMergePullRequest,
  onUpdateSettings,
  settings,
  state,
}: PullRequestsScreenProps) {
  const [selectedPullRequestIds, setSelectedPullRequestIds] = useState<number[]>([]);
  const [mergedPullRequests, setMergedPullRequests] = useState<number[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeErrorMessage, setMergeErrorMessage] = useState<string | undefined>();
  const [mergeResults, setMergeResults] = useState<MergeResult[]>([]);
  const profileLogin = data?.profile.login ?? "";

  const visiblePullRequests = useMemo(() => {
    const normalizedSearch = settings.pullRequestSearch.trim().toLowerCase();
    const filteredPullRequests = (data?.pullRequests ?? [])
      .filter((pullRequest) => !mergedPullRequests.includes(pullRequest.id))
      .filter((pullRequest) => {
        const creator = getPullRequestCreatorCategory(pullRequest, profileLogin);
        return settings.pullRequestCreator === "all" || creator === settings.pullRequestCreator;
      })
      .filter((pullRequest) =>
        normalizedSearch.length === 0 ||
        pullRequest.title.toLowerCase().includes(normalizedSearch) ||
        pullRequest.repositoryFullName.toLowerCase().includes(normalizedSearch) ||
        pullRequest.labelNames.some((label) => label.toLowerCase().includes(normalizedSearch))
      )
      .filter((pullRequest) => {
        const bucket = getPullRequestStatusBucket(pullRequest);
        return settings.pullRequestStatus === "all" || bucket === settings.pullRequestStatus;
      });

    return filteredPullRequests.toSorted((left, right) =>
      comparePullRequests(left, right, settings.pullRequestSort)
    );
  }, [
    data?.pullRequests,
    mergedPullRequests,
    profileLogin,
    settings.pullRequestCreator,
    settings.pullRequestSearch,
    settings.pullRequestSort,
    settings.pullRequestStatus,
  ]);

  const selectedPullRequests = visiblePullRequests.filter((pullRequest) =>
    selectedPullRequestIds.includes(pullRequest.id)
  );
  const mergeablePullRequests = selectedPullRequests.filter((pullRequest) =>
    !isPullRequestMergeBlocked(pullRequest)
  );
  const blockedSelectedPullRequests = selectedPullRequests.filter(isPullRequestMergeBlocked);
  const readyVisiblePullRequests = visiblePullRequests.filter((pullRequest) =>
    !isPullRequestMergeBlocked(pullRequest)
  );
  const visibleBlockedCount = visiblePullRequests.filter(isPullRequestMergeBlocked).length;
  const selectedPullRequestIdSet = new Set(selectedPullRequestIds);
  const mergeBlocked = mergeablePullRequests.length === 0 || isMerging;

  function handleTogglePullRequest(pullRequest: PullRequestSummary): void {
    setSelectedPullRequestIds((currentValue) =>
      currentValue.includes(pullRequest.id)
        ? currentValue.filter((pullRequestId) => pullRequestId !== pullRequest.id)
        : [...currentValue, pullRequest.id]
    );
    setMergeErrorMessage(undefined);
    setMergeResults([]);
    logger.info(
      { pullRequestId: pullRequest.id, repository: pullRequest.repositoryFullName },
      "PR selection toggled",
    );
  }

  function handleSelectReadyPullRequests(): void {
    setSelectedPullRequestIds(readyVisiblePullRequests.map((pullRequest) => pullRequest.id));
    setMergeErrorMessage(undefined);
    setMergeResults([]);
  }

  function handleClearSelectedPullRequests(): void {
    setSelectedPullRequestIds([]);
    setMergeErrorMessage(undefined);
  }

  async function handleMergeSelectedPullRequests(): Promise<void> {
    if (mergeBlocked) {
      return;
    }

    setMergeErrorMessage(undefined);
    setMergeResults([]);
    setIsMerging(true);

    const results = await Promise.allSettled(
      mergeablePullRequests.map(async (pullRequest): Promise<MergeResult> => {
        if (settings.dataSource === "live") {
          await onMergePullRequest(pullRequest);
        }

        return {
          pullRequestId: pullRequest.id,
          title: pullRequest.title,
          repositoryFullName: pullRequest.repositoryFullName,
          outcome: "merged",
          message: "Merge request accepted",
        };
      }),
    );
    const nextResults: MergeResult[] = results.map((result, index) => {
      const pullRequest = mergeablePullRequests[index];

      if (result.status === "fulfilled") {
        return result.value;
      }

      const message = result.reason instanceof Error
        ? result.reason.message
        : "GitHub rejected the merge request.";

      return {
        pullRequestId: pullRequest.id,
        title: pullRequest.title,
        repositoryFullName: pullRequest.repositoryFullName,
        outcome: "failed",
        message,
      };
    });

    const skippedResults = blockedSelectedPullRequests.map((pullRequest): MergeResult => ({
      pullRequestId: pullRequest.id,
      title: pullRequest.title,
      repositoryFullName: pullRequest.repositoryFullName,
      outcome: "skipped",
      message: getPullRequestBlockReason(pullRequest),
    }));
    const mergedPullRequestIds = nextResults
      .filter((result) => result.outcome === "merged")
      .map((result) => result.pullRequestId);
    const failedResults = nextResults.filter((result) => result.outcome === "failed");

    setMergedPullRequests((currentValue) => [...currentValue, ...mergedPullRequestIds]);
    setSelectedPullRequestIds((currentValue) =>
      currentValue.filter((pullRequestId) => !mergedPullRequestIds.includes(pullRequestId))
    );
    setMergeResults([...nextResults, ...skippedResults]);

    if (failedResults.length > 0) {
      const message = `${failedResults.length} merge request${
        failedResults.length === 1 ? "" : "s"
      } failed. Review the result list before retrying.`;
      setMergeErrorMessage(message);
    }

    logger.info(
      {
        attempted: mergeablePullRequests.length,
        merged: mergedPullRequestIds.length,
        failed: failedResults.length,
        skipped: skippedResults.length,
      },
      "Batch PR merge completed",
    );

    setIsMerging(false);
  }

  return (
    <section className="screen">
      <section className="container page-section">
        <p className="eyebrow">pull requests hub</p>
        <h1>Batch Dependabot merges with the risky work kept out of the way.</h1>
        <p className="lead">
          Start from the full Dependabot queue, select the mergeable set you trust, send merge
          requests together, then review the result list without bouncing through GitHub one PR at a
          time.
        </p>
        <div className="summary-strip" aria-label="Pull request summary">
          <MetricCard label="PRs in view" value={String(visiblePullRequests.length)} />
          <MetricCard label="Mergeable" value={String(readyVisiblePullRequests.length)} />
          <MetricCard label="Blocked" value={String(visibleBlockedCount)} />
          <MetricCard label="Selected" value={String(selectedPullRequests.length)} />
        </div>
        <div className="toolbar toolbar--with-margin">
          <div className="field field-wide">
            <label className="label" htmlFor="pr-search">Search queue</label>
            <input
              id="pr-search"
              type="search"
              placeholder="repository, title, or label..."
              value={settings.pullRequestSearch}
              onChange={(event) =>
                onUpdateSettings({ pullRequestSearch: event.currentTarget.value })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="creator-filter">Creator filter</label>
            <select
              id="creator-filter"
              value={settings.pullRequestCreator}
              onChange={(event) =>
                onUpdateSettings({
                  pullRequestCreator: event.currentTarget.value as PullRequestCreatorFilter,
                })}
            >
              <option value="dependabot">Dependabot</option>
              <option value="all">All creators</option>
              <option value="me">Only me</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="status-filter">Merge state</label>
            <select
              id="status-filter"
              value={settings.pullRequestStatus}
              onChange={(event) =>
                onUpdateSettings({
                  pullRequestStatus: event.currentTarget.value as PullRequestStatusFilter,
                })}
            >
              <option value="mergeable">Mergeable now</option>
              <option value="blocked">Blocked</option>
              <option value="attention">Needs review</option>
              <option value="all">All states</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="sort-filter">Sort order</label>
            <select
              id="sort-filter"
              value={settings.pullRequestSort}
              onChange={(event) =>
                onUpdateSettings({
                  pullRequestSort: event.currentTarget.value as PullRequestSortOrder,
                })}
            >
              <option value="urgent">Most urgent first</option>
              <option value="updated">Recently updated first</option>
              <option value="created">Recently created first</option>
            </select>
          </div>
        </div>
      </section>

      <section className="container page-section">
        <DataStateNotice state={state} />
        {mergeErrorMessage && (
          <div className="card helper-card helper-card--danger">{mergeErrorMessage}</div>
        )}
        <div className="card">
          <div className="table-actions">
            <div>
              <h3>PR queue</h3>
              <p className="label">
                {readyVisiblePullRequests.length} ready, {visibleBlockedCount}{" "}
                blocked in the current filter.
              </p>
            </div>
            <div className="row">
              <button className="btn" type="button" onClick={handleSelectReadyPullRequests}>
                Select mergeable
              </button>
              <button className="btn" type="button" onClick={handleClearSelectedPullRequests}>
                Clear
              </button>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Select</th>
                <th>PR</th>
                <th>Repository</th>
                <th>Creator</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visiblePullRequests.length === 0
                ? (
                  <tr>
                    <td className="empty" colSpan={7}>No pull requests in this filter.</td>
                  </tr>
                )
                : visiblePullRequests.map((pullRequest) => (
                  <tr
                    className={selectedPullRequestIdSet.has(pullRequest.id) ? "row-selected" : ""}
                    key={pullRequest.id}
                  >
                    <td>
                      <input
                        aria-label={`Select ${pullRequest.title}`}
                        checked={selectedPullRequestIdSet.has(pullRequest.id)}
                        type="checkbox"
                        onChange={() => handleTogglePullRequest(pullRequest)}
                      />
                    </td>
                    <td>
                      <div className="stack-tight">
                        <span>{pullRequest.title}</span>
                        <span className="label">{formatPullRequestMeta(pullRequest)}</span>
                      </div>
                    </td>
                    <td className="mono">{pullRequest.repositoryFullName}</td>
                    <td>
                      {formatPullRequestCreator(
                        getPullRequestCreatorCategory(pullRequest, profileLogin),
                        pullRequest.author,
                      )}
                    </td>
                    <td>{renderPullRequestStatus(pullRequest)}</td>
                    <td className="mono">{formatDateTime(pullRequest.updatedAt)}</td>
                    <td>
                      <a className="btn" href={pullRequest.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="container page-section">
        <div className="card card-muted batch-panel">
          <div className="row-between">
            <div>
              <h3>Batch merge preflight</h3>
              <p className="label">
                {mergeablePullRequests.length} will be sent to GitHub.{" "}
                {blockedSelectedPullRequests.length} selected PRs are blocked and will be skipped.
              </p>
            </div>
            <div className="row">
              <button
                className="btn btn-primary"
                disabled={mergeBlocked}
                type="button"
                onClick={() => void handleMergeSelectedPullRequests()}
              >
                {isMerging ? "Merging..." : `Merge ${mergeablePullRequests.length} PRs`}
              </button>
            </div>
          </div>
          <div className="preflight-grid">
            <PreflightCard
              label="Will merge"
              tone="success"
              value={String(mergeablePullRequests.length)}
            />
            <PreflightCard
              label="Skipped"
              tone="warning"
              value={String(blockedSelectedPullRequests.length)}
            />
            <PreflightCard
              label="Checks look green"
              tone="success"
              value={String(mergeablePullRequests.filter(hasPassingChecks).length)}
            />
            <PreflightCard
              label="Need attention"
              tone="danger"
              value={String(blockedSelectedPullRequests.length)}
            />
          </div>
          {selectedPullRequests.length > 0 && (
            <div className="result-list">
              {selectedPullRequests.slice(0, 6).map((pullRequest) => (
                <div className="result-row" key={pullRequest.id}>
                  <span className="mono">
                    {pullRequest.repositoryFullName}#{pullRequest.number}
                  </span>
                  <span>{pullRequest.title}</span>
                  <span>{renderPullRequestStatus(pullRequest)}</span>
                </div>
              ))}
              {selectedPullRequests.length > 6 && (
                <p className="label">+ {selectedPullRequests.length - 6} more selected</p>
              )}
            </div>
          )}
          {mergeResults.length > 0 && (
            <div className="result-list">
              <h3>Merge results</h3>
              {mergeResults.map((result) => (
                <div className="result-row" key={`${result.pullRequestId}-${result.outcome}`}>
                  <StatusPill tone={mapMergeOutcomeTone(result.outcome)}>
                    {formatMergeOutcome(result.outcome)}
                  </StatusPill>
                  <span>{result.repositoryFullName}</span>
                  <span className="label">{result.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ScreenFooter
        ctaLabel="Adjust defaults in Settings →"
        ctaTo="/settings"
        note="Default route: Dependabot + urgent-first sorting."
      />
    </section>
  );
}

export function WorkflowsScreen({
  data,
  onUpdateSettings,
  settings,
  state,
}: WorkflowsScreenProps) {
  const visibleWorkflows = (data?.workflows ?? []).filter((workflow) =>
    matchesWorkflowThreshold(workflow.status, settings.workflowAlertThreshold)
  );

  return (
    <section className="screen">
      <section className="container page-section">
        <p className="eyebrow">workflow alerts</p>
        <h1>Track failing, flaky, and queued pipelines across all tracked repositories.</h1>
        <p className="lead">
          Prioritize breakages first, then move to warning-level flaky runs before they block merge
          flow.
        </p>
        <div className="toolbar toolbar--with-margin">
          <div className="field">
            <label className="label" htmlFor="workflow-level">Alert level</label>
            <select
              id="workflow-level"
              value={settings.workflowAlertThreshold}
              onChange={(event) =>
                onUpdateSettings({
                  workflowAlertThreshold: event.currentTarget.value as WorkflowAlertThreshold,
                })}
            >
              <option value="all">All alerts</option>
              <option value="failed">Failed only</option>
              <option value="warn">Warnings only</option>
            </select>
          </div>
        </div>
      </section>

      <section className="container page-section">
        <DataStateNotice state={state} />
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Workflow</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Last run</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleWorkflows.length === 0
                ? (
                  <tr>
                    <td className="empty" colSpan={6}>No workflows match this filter.</td>
                  </tr>
                )
                : visibleWorkflows.map((workflow) => (
                  <tr key={workflow.id}>
                    <td className="mono">{workflow.repositoryFullName}</td>
                    <td>{workflow.workflowName}</td>
                    <td className="mono">{workflow.branch}</td>
                    <td>
                      <StatusPill tone={mapWorkflowTone(workflow.status)}>
                        {formatWorkflowState(workflow.status)}
                      </StatusPill>
                    </td>
                    <td className="mono">{formatDateTime(workflow.updatedAt)}</td>
                    <td>
                      <a className="btn" href={workflow.url} target="_blank" rel="noreferrer">
                        Open run
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <ScreenFooter
        ctaLabel="Open PR Hub triage →"
        ctaTo="/pull-requests"
        note="Workflow focus feeds PR urgency ranking."
      />
    </section>
  );
}

export function RepositoryDetailScreen({ data, state }: SharedScreenProps) {
  const [activeTab, setActiveTab] = useState<RepositoryDetailTab>("prs");
  const params = useParams();
  const repositoryFullName = params.owner && params.repo
    ? `${params.owner}/${params.repo}`
    : undefined;
  const repository = repositoryFullName && data
    ? getRepositoryByFullName(data.repositories, repositoryFullName)
    : undefined;
  const relatedPullRequests =
    data?.pullRequests.filter((pullRequest) =>
      pullRequest.repositoryFullName === repositoryFullName
    ) ?? [];
  const relatedWorkflows =
    data?.workflows.filter((workflow) => workflow.repositoryFullName === repositoryFullName) ?? [];

  if (!data && state.isLoading) {
    return (
      <section className="screen">
        <section className="container page-section">
          <p className="eyebrow">repository detail</p>
          <h1>Loading repository detail…</h1>
        </section>
      </section>
    );
  }

  if (!repository) {
    return (
      <section className="screen">
        <section className="container page-section">
          <p className="eyebrow">repository detail</p>
          <h1>Repository not found.</h1>
        </section>
        <section className="container page-section">
          <DataStateNotice state={state} />
        </section>
      </section>
    );
  }

  const issueRows = createIssueRows(repository);

  return (
    <section className="screen">
      <section className="container page-section">
        <p className="eyebrow">repository detail</p>
        <h1>{repository.fullName}</h1>
        <p className="lead">
          Central health view for PR velocity, issue pressure, and workflow reliability on the
          default branch.
        </p>
      </section>

      <section className="container page-section">
        <div className="grid-4">
          <MetricCard label="Open pull requests" value={String(repository.openPrCount)} />
          <MetricCard label="Open issues" value={String(repository.openIssueCount)} />
          <MetricCard
            label="Failing workflows"
            value={String(countFailingWorkflows(relatedWorkflows))}
          />
          <MetricCard
            label="Latest commit on main"
            value={formatDateTime(repository.lastCommitAt)}
          />
        </div>
      </section>

      <section className="container page-section">
        <div className="row tab-row" role="tablist" aria-label="repo detail tabs">
          <button
            className={activeTab === "prs" ? "btn btn-primary" : "btn"}
            data-tab="prs"
            type="button"
            onClick={() => setActiveTab("prs")}
          >
            PR queue
          </button>
          <button
            className={activeTab === "issues" ? "btn btn-primary" : "btn"}
            data-tab="issues"
            type="button"
            onClick={() => setActiveTab("issues")}
          >
            Issues
          </button>
          <button
            className={activeTab === "workflows" ? "btn btn-primary" : "btn"}
            data-tab="workflows"
            type="button"
            onClick={() => setActiveTab("workflows")}
          >
            Workflow runs
          </button>
        </div>

        {activeTab === "prs" && (
          <div className="card card-top-gap">
            <table className="table">
              <thead>
                <tr>
                  <th>PR</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {relatedPullRequests.map((pullRequest) => (
                  <tr key={pullRequest.id}>
                    <td>{pullRequest.title}</td>
                    <td>{renderPullRequestStatus(pullRequest)}</td>
                    <td className="mono">{formatDateTime(pullRequest.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "issues" && (
          <div className="card card-top-gap">
            <table className="table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Priority</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {issueRows.map((issue) => (
                  <tr key={issue.title}>
                    <td>{issue.title}</td>
                    <td>
                      <StatusPill tone={issue.priorityTone}>{issue.priorityLabel}</StatusPill>
                    </td>
                    <td className="mono">{issue.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "workflows" && (
          <div className="card card-top-gap">
            <table className="table">
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Result</th>
                  <th>Last run</th>
                </tr>
              </thead>
              <tbody>
                {relatedWorkflows.length === 0
                  ? (
                    <tr>
                      <td className="empty" colSpan={3}>No workflow alerts for this repository.</td>
                    </tr>
                  )
                  : relatedWorkflows.map((workflow) => (
                    <tr key={workflow.id}>
                      <td>{workflow.workflowName}</td>
                      <td>
                        <StatusPill tone={mapWorkflowTone(workflow.status)}>
                          {formatWorkflowState(workflow.status)}
                        </StatusPill>
                      </td>
                      <td className="mono">{formatDateTime(workflow.updatedAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ScreenFooter
        ctaLabel="Open PR Hub →"
        ctaTo="/pull-requests"
        note="Repository detail links back to global PR and workflow hubs."
      />
    </section>
  );
}

export function SettingsScreen({
  connectedAccount,
  credentialReady,
  hasSharedCredential,
  onConnectWithPat,
  onConnectWithSharedPat,
  onDisconnectPat,
  onResetSettings,
  onUpdateSettings,
  settings,
}: SettingsScreenProps) {
  const [patInput, setPatInput] = useState("");
  const [credentialError, setCredentialError] = useState<string>();
  const [connecting, setConnecting] = useState(false);

  async function connectWithPat(): Promise<void> {
    setConnecting(true);
    setCredentialError(undefined);
    try {
      await onConnectWithPat(patInput);
      setPatInput("");
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : "Could not connect this PAT.");
    } finally {
      setConnecting(false);
    }
  }

  async function connectWithSharedPat(): Promise<void> {
    setConnecting(true);
    setCredentialError(undefined);
    try {
      await onConnectWithSharedPat();
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : "Could not use the shared PAT.");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectPat(): Promise<void> {
    await onDisconnectPat();
    setCredentialError(undefined);
  }

  return (
    <section className="screen">
      <section className="container page-section">
        <p className="eyebrow">settings / filters</p>
        <h1>Tune default triage behavior for pull requests and alerts.</h1>
        <p className="lead">
          Preferences persist in this browser. A connected GitHub PAT stays in session storage or
          is reused from the Page Apps hub after you approve it for this app.
        </p>
      </section>

      <section className="container page-section">
        <div className="grid-2">
          <div className="card stack">
            <div className="field">
              <label className="label" htmlFor="default-creator">Default creator filter</label>
              <select
                id="default-creator"
                value={settings.pullRequestCreator}
                onChange={(event) =>
                  onUpdateSettings({
                    pullRequestCreator: event.currentTarget.value as PullRequestCreatorFilter,
                  })}
              >
                <option value="dependabot">Dependabot</option>
                <option value="all">All creators</option>
                <option value="me">Only me</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="sort-order">PR sort order</label>
              <select
                id="sort-order"
                value={settings.pullRequestSort}
                onChange={(event) =>
                  onUpdateSettings({
                    pullRequestSort: event.currentTarget.value as PullRequestSortOrder,
                  })}
              >
                <option value="urgent">Most urgent first</option>
                <option value="updated">Recently updated</option>
                <option value="created">Recently created</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="status-default">Default PR state</label>
              <select
                id="status-default"
                value={settings.pullRequestStatus}
                onChange={(event) =>
                  onUpdateSettings({
                    pullRequestStatus: event.currentTarget.value as PullRequestStatusFilter,
                  })}
              >
                <option value="mergeable">Mergeable now</option>
                <option value="blocked">Blocked</option>
                <option value="attention">Needs review</option>
                <option value="all">All states</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="repo-scope">Repository scope</label>
              <select
                id="repo-scope"
                value={settings.repositoryScope}
                onChange={(event) =>
                  onUpdateSettings({
                    repositoryScope: event.currentTarget.value as AppSettings["repositoryScope"],
                  })}
              >
                <option value="all">My + org + contributing repos</option>
                <option value="personal">Only my repos</option>
                <option value="organization">Only org repos</option>
                <option value="contributing">Only contributing repos</option>
              </select>
            </div>

            <label className="check-field">
              <input
                type="checkbox"
                checked={settings.includeArchivedRepositories}
                onChange={(event) =>
                  onUpdateSettings({ includeArchivedRepositories: event.currentTarget.checked })}
              />
              Include archived repositories
            </label>

            <div className="field">
              <label className="label" htmlFor="alert-threshold">Workflow alert threshold</label>
              <select
                id="alert-threshold"
                value={settings.workflowAlertThreshold}
                onChange={(event) =>
                  onUpdateSettings({
                    workflowAlertThreshold: event.currentTarget.value as WorkflowAlertThreshold,
                  })}
              >
                <option value="failed">Only failed jobs</option>
                <option value="warn">Failed + flaky jobs</option>
                <option value="all">All non-success jobs</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="theme-mode">Theme</label>
              <select
                id="theme-mode"
                value={settings.theme}
                onChange={(event) =>
                  onUpdateSettings({ theme: event.currentTarget.value as ThemeMode })}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="data-source">Data source</label>
              <select
                id="data-source"
                value={settings.dataSource}
                onChange={(event) =>
                  onUpdateSettings({ dataSource: event.currentTarget.value as DataSourceMode })}
              >
                <option value="mock">Mock dataset</option>
                <option value="live">Live GitHub API</option>
              </select>
            </div>

            <div className="field">
              <span className="label">GitHub connection</span>
              <p>{credentialReady
                ? connectedAccount ? `Connected as @${connectedAccount}` : "Not connected"
                : "Checking for an approved shared PAT…"}</p>
              {connectedAccount
                ? <button className="btn" type="button" onClick={() => void disconnectPat()}>Disconnect this app</button>
                : null}
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!hasSharedCredential || connecting}
              onClick={() => void connectWithSharedPat()}
            >
              Use shared PAT from Page Apps
            </button>
            <div className="field">
              <label className="label" htmlFor="github-token">Or connect a PAT for this session</label>
              <input
                id="github-token"
                type="password"
                autoComplete="off"
                value={patInput}
                placeholder="Fine-grained GitHub PAT"
                onChange={(event) => setPatInput(event.currentTarget.value)}
              />
              <button className="btn" type="button" disabled={!patInput.trim() || connecting} onClick={() => void connectWithPat()}>
                Connect with PAT
              </button>
              {credentialError ? <p role="alert">{credentialError}</p> : null}
            </div>

            <div className="row">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => logger.info({ theme: settings.theme }, "Settings saved")}
              >
                Save settings
              </button>
              <button
                className="btn"
                type="button"
                onClick={onResetSettings}
              >
                Reset defaults
              </button>
            </div>
          </div>

          <div className="card card-muted stack">
            <h3>Current profile</h3>
            <MetricSummary label="PR hub default" value={settings.pullRequestCreator} />
            <MetricSummary label="Default PR state" value={settings.pullRequestStatus} />
            <MetricSummary label="Sort order" value={settings.pullRequestSort} />
            <MetricSummary label="Repo scope" value={settings.repositoryScope} />
            <MetricSummary label="Workflow threshold" value={settings.workflowAlertThreshold} />
            <div className="setup-doc">
              <h3>GitHub PAT access</h3>
              <p className="label">
                {SECURITY_DISCLOSURE}
              </p>
              <p className="label">
                This dashboard can access every repository the PAT authorizes. Its framework client only exposes repository listing, pull request and workflow reads, topic edits, and pull request merges.
              </p>
              <ol>
                <li>Create a fine-grained PAT and select only the repositories this dashboard should show.</li>
                <li>Grant Pull requests read and write to review or merge PRs.</li>
                <li>Grant Actions read to show workflow health and Administration write to edit repository topics.</li>
                <li>Use the Page Apps index to set up a shared PAT, or paste a PAT here for this tab session.</li>
              </ol>
              <p className="label">
                This dashboard only discovers repositories granted to the connected PAT. The PAT is sent only to GitHub through the shared framework client.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ScreenFooter
        ctaLabel="Open PR Hub with profile →"
        ctaTo="/pull-requests"
        note="Saved settings apply immediately to this prototype."
      />
    </section>
  );
}

function QuickLinkCard({
  description,
  href,
  label,
  title,
}: {
  readonly description: string;
  readonly href: string;
  readonly label: string;
  readonly title: string;
}) {
  return (
    <Link className="card" to={href}>
      <p className="eyebrow">{label}</p>
      <h3>{title}</h3>
      <p className="label">{description}</p>
    </Link>
  );
}

function MetricCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="card metric">
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

function PreflightCard({
  label,
  tone,
  value,
}: {
  readonly label: string;
  readonly tone: "success" | "warning" | "danger";
  readonly value: string;
}) {
  return (
    <div className={`preflight-card preflight-card--${tone}`}>
      <span className="value mono">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

function MetricSummary({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="value mono">{value}</span>
    </div>
  );
}

function DataStateNotice({ state }: { readonly state: ScreenState }) {
  if (state.isLoading) {
    return <div className="card card-muted helper-card">Loading the latest dashboard data…</div>;
  }

  if (state.errorMessage) {
    return <div className="card helper-card helper-card--danger">{state.errorMessage}</div>;
  }

  return null;
}

function ScreenFooter({
  ctaLabel,
  ctaTo,
  note,
}: {
  readonly ctaLabel: string;
  readonly ctaTo: string;
  readonly note: string;
}) {
  return (
    <footer className="pagefoot">
      <div className="container row-between">
        <span>{note}</span>
        <span>
          <Link to={ctaTo}>{ctaLabel}</Link>
        </span>
      </div>
    </footer>
  );
}

function countOpenIssues(data: DashboardData): number {
  return data.repositories.reduce((total, repository) => total + repository.openIssueCount, 0);
}

function sortRepositoriesForDashboard(
  repositories: readonly RepositorySummary[],
  sortOrder: RepositorySortOrder,
): readonly RepositorySummary[] {
  if (sortOrder === "open-prs") {
    return [...repositories].toSorted((left, right) =>
      right.openPrCount - left.openPrCount || right.lastCommitAt.localeCompare(left.lastCommitAt)
    );
  }

  if (sortOrder === "updated") {
    return [...repositories].toSorted((left, right) =>
      right.lastCommitAt.localeCompare(left.lastCommitAt)
    );
  }

  return [...repositories].toSorted((left, right) =>
    getRepositoryAttentionScore(right) - getRepositoryAttentionScore(left) ||
    right.lastCommitAt.localeCompare(left.lastCommitAt)
  );
}

function getRepositoryAttentionScore(repository: RepositorySummary): number {
  const workflowScore = repository.workflowState === "failing"
    ? 8
    : repository.workflowState === "warning"
    ? 4
    : 0;

  return workflowScore + repository.openPrCount * 2 + repository.reviewRequests +
    repository.openIssueCount;
}

function renderRepositoryAttention(repository: RepositorySummary) {
  if (repository.archived) {
    return <StatusPill>Archived</StatusPill>;
  }

  if (repository.workflowState === "failing") {
    return <StatusPill tone="danger">Build failing</StatusPill>;
  }

  if (repository.openPrCount > 0) {
    return <StatusPill tone="warning">{repository.openPrCount} PRs open</StatusPill>;
  }

  return <StatusPill tone="success">Quiet</StatusPill>;
}

function formatGroup(group: RepositorySummary["group"]): string {
  switch (group) {
    case "personal":
      return "My repo";
    case "organization":
      return "Org repo";
    case "contributing":
      return "Contributing";
  }
}

function formatRepositoryWorkflowLabel(state: WorkflowState): string {
  switch (state) {
    case "healthy":
      return "Checks passing";
    case "warning":
      return "1 flaky workflow";
    case "failing":
      return "Last build failed";
  }
}

function formatWorkflowState(state: WorkflowState): string {
  switch (state) {
    case "healthy":
      return "Passing";
    case "warning":
      return "Warning";
    case "failing":
      return "Failed";
  }
}

function mapWorkflowTone(state: WorkflowState): "success" | "warning" | "danger" {
  switch (state) {
    case "healthy":
      return "success";
    case "warning":
      return "warning";
    case "failing":
      return "danger";
  }
}

function getPullRequestCreatorCategory(
  pullRequest: PullRequestSummary,
  profileLogin: string,
): PullRequestCreatorFilter {
  if (
    pullRequest.author.toLowerCase().includes("dependabot") ||
    pullRequest.title.toLowerCase().startsWith("bump ")
  ) {
    return "dependabot";
  }

  if (profileLogin.length > 0 && pullRequest.author === profileLogin) {
    return "me";
  }

  return "all";
}

function getPullRequestStatusBucket(
  pullRequest: PullRequestSummary,
): PullRequestStatusFilter {
  if (isPullRequestMergeBlocked(pullRequest) || pullRequest.draft) {
    return "blocked";
  }

  if (
    pullRequest.reviewState === "needs-review" ||
    pullRequest.reviewState === "changes-requested"
  ) {
    return "attention";
  }

  return "mergeable";
}

function formatPullRequestCreator(category: PullRequestCreatorFilter, author: string): string {
  switch (category) {
    case "dependabot":
      return "dependabot";
    case "me":
      return "me";
    case "all":
      return author;
  }
}

function comparePullRequests(
  left: PullRequestSummary,
  right: PullRequestSummary,
  sortOrder: PullRequestSortOrder,
): number {
  if (sortOrder === "updated") {
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  if (sortOrder === "created") {
    return right.number - left.number;
  }

  return getPullRequestUrgency(right) - getPullRequestUrgency(left) ||
    right.updatedAt.localeCompare(left.updatedAt);
}

function getPullRequestUrgency(pullRequest: PullRequestSummary): number {
  if (pullRequest.mergeConflict) {
    return 5;
  }
  if (pullRequest.checksSummary.toLowerCase().includes("fail")) {
    return 5;
  }
  if (pullRequest.reviewState === "needs-review") {
    return 3;
  }
  if (pullRequest.reviewState === "ready-to-merge") {
    return 2;
  }
  return 1;
}

function isPullRequestMergeBlocked(pullRequest: PullRequestSummary): boolean {
  return pullRequest.mergeConflict ||
    pullRequest.draft ||
    pullRequest.reviewState === "changes-requested" ||
    pullRequest.checksSummary.toLowerCase().includes("fail");
}

function getPullRequestBlockReason(pullRequest: PullRequestSummary): string {
  if (pullRequest.mergeConflict) {
    return "Skipped because GitHub reports or the title suggests a merge conflict.";
  }

  if (pullRequest.checksSummary.toLowerCase().includes("fail")) {
    return "Skipped because checks are failing.";
  }

  if (pullRequest.draft) {
    return "Skipped because the pull request is still a draft.";
  }

  if (pullRequest.reviewState === "changes-requested") {
    return "Skipped because changes were requested.";
  }

  return "Skipped by preflight.";
}

function hasPassingChecks(pullRequest: PullRequestSummary): boolean {
  const normalizedSummary = pullRequest.checksSummary.toLowerCase();
  return normalizedSummary.includes("pass") ||
    normalizedSummary.includes("green") ||
    normalizedSummary.includes("ready");
}

function renderPullRequestStatus(pullRequest: PullRequestSummary) {
  if (pullRequest.mergeConflict) {
    return <StatusPill tone="danger">Merge conflict</StatusPill>;
  }

  if (pullRequest.checksSummary.toLowerCase().includes("fail")) {
    return <StatusPill tone="danger">Failed checks</StatusPill>;
  }

  switch (pullRequest.reviewState) {
    case "draft":
      return <StatusPill>Checks running</StatusPill>;
    case "needs-review":
      return <StatusPill tone="warning">Needs review</StatusPill>;
    case "changes-requested":
      return <StatusPill tone="warning">Changes requested</StatusPill>;
    case "ready-to-merge":
      return <StatusPill tone="success">Ready to merge</StatusPill>;
  }
}

function formatPullRequestMeta(pullRequest: PullRequestSummary): string {
  return `${pullRequest.repositoryFullName} · ${pullRequest.checksSummary} · ${
    formatDateTime(pullRequest.updatedAt)
  }`;
}

function formatMergeOutcome(outcome: MergeOutcome): string {
  switch (outcome) {
    case "merged":
      return "Merged";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
  }
}

function mapMergeOutcomeTone(outcome: MergeOutcome): "success" | "warning" | "danger" {
  switch (outcome) {
    case "merged":
      return "success";
    case "failed":
      return "danger";
    case "skipped":
      return "warning";
  }
}

function matchesWorkflowThreshold(
  workflowState: WorkflowState,
  threshold: WorkflowAlertThreshold,
): boolean {
  if (threshold === "all") {
    return true;
  }

  if (threshold === "failed") {
    return workflowState === "failing";
  }

  return workflowState === "failing" || workflowState === "warning";
}

function countFailingWorkflows(
  workflows: readonly DashboardData["workflows"][number][],
): number {
  return workflows.filter((workflow) => workflow.status === "failing").length;
}

function createIssueRows(repository: RepositorySummary) {
  return [
    {
      title: `${repository.name} search results jump on mobile breakpoint`,
      priorityLabel: "P1",
      priorityTone: "warning" as const,
      updatedAt: "2026-06-06 08:31",
    },
    {
      title: `${repository.name} team filter not persisted`,
      priorityLabel: "P2",
      priorityTone: "neutral" as const,
      updatedAt: "2026-06-05 22:02",
    },
    {
      title: `${repository.name} workflow card should show flaky rate`,
      priorityLabel: "P3",
      priorityTone: "neutral" as const,
      updatedAt: "2026-06-04 19:10",
    },
  ];
}
