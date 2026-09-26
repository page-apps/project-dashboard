import React, { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import type { CredentialProvider } from "@repo-apps/credentials";

import { AppShell } from "./components/AppShell.tsx";
import {
  DashboardScreen,
  LauncherScreen,
  PullRequestsScreen,
  RepositoryDetailScreen,
  SettingsScreen,
  WorkflowsScreen,
} from "./features/screens.tsx";
import { loadDashboardData, mergePullRequest, updateRepositoryTopics } from "./lib/github.ts";
import { installGlobalErrorHandlers, logger } from "./lib/logger.ts";
import {
  connectSessionCredential,
  connectSharedCredential,
  disconnectCredential,
  hasSharedCredential,
  restoreCredential,
} from "./lib/credentials.ts";
import {
  type AppSettings,
  createDefaultSettings,
  loadSettings,
  saveSettings,
  updateSettings,
} from "./lib/settings.ts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 60_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardApplication />
    </QueryClientProvider>
  );
}

function DashboardApplication() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [credentialProvider, setCredentialProvider] = useState<CredentialProvider | null>(null);
  const [account, setAccount] = useState<string>();
  const [credentialVersion, setCredentialVersion] = useState(0);
  const [sharedCredentialAvailable, setSharedCredentialAvailable] = useState(false);
  const [credentialReady, setCredentialReady] = useState(false);
  const query = useQuery({
    queryKey: [
      "dashboard-data",
      settings.dataSource,
      account ?? (credentialProvider !== null),
      credentialVersion,
      settings.repositoryScope,
      settings.includeArchivedRepositories,
    ],
    queryFn: () => loadDashboardData(settings, credentialProvider),
  });

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([restoreCredential(), hasSharedCredential()]).then(([restored, sharedAvailable]) => {
      if (cancelled) return;
      setCredentialProvider(restored.provider);
      setAccount(restored.account);
      setCredentialVersion((version) => version + 1);
      if (restored.provider) setSettings((current) => ({ ...current, dataSource: "live" }));
      setSharedCredentialAvailable(sharedAvailable);
      setCredentialReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (settings.theme === "system") {
      delete root.dataset.theme;
      return;
    }

    root.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    logger.info(
      {
        dataSource: settings.dataSource,
        theme: settings.theme,
        workflowAlertThreshold: settings.workflowAlertThreshold,
      },
      "Dashboard settings updated",
    );
  }, [settings.dataSource, settings.theme, settings.workflowAlertThreshold]);

  useEffect(() => {
    if (query.data) {
      logger.info(
        {
          repositories: query.data.repositories.length,
          pullRequests: query.data.pullRequests.length,
          workflows: query.data.workflows.length,
        },
        "Dashboard data loaded",
      );
    }
  }, [query.data]);

  useEffect(() => {
    if (query.error instanceof Error) {
      logger.error({ message: query.error.message }, "Dashboard data load failed");
    }
  }, [query.error]);

  const profileName = query.data?.profile.name ?? "Local dashboard";
  const screenState = useMemo(() => ({
    isLoading: query.isPending && !query.data,
    errorMessage: query.error instanceof Error ? query.error.message : undefined,
  }), [query.data, query.error, query.isPending]);

  function applySettingsPatch(patch: Partial<AppSettings>) {
    setSettings((currentSettings) => updateSettings(currentSettings, patch));
  }

  function cycleTheme() {
    const nextTheme = settings.theme === "system"
      ? "light"
      : settings.theme === "light"
      ? "dark"
      : "system";
    applySettingsPatch({ theme: nextTheme });
  }

  function resetSettings() {
    setSettings(createDefaultSettings());
  }

  async function connectWithSharedPat() {
    const connected = await connectSharedCredential();
    setCredentialProvider(connected.provider);
    setAccount(connected.account);
    setCredentialVersion((version) => version + 1);
    applySettingsPatch({ dataSource: "live" });
  }

  async function connectWithPat(token: string) {
    const connected = await connectSessionCredential(token);
    setCredentialProvider(connected.provider);
    setAccount(connected.account);
    setCredentialVersion((version) => version + 1);
    applySettingsPatch({ dataSource: "live" });
  }

  async function disconnectPat() {
    await disconnectCredential();
    setCredentialProvider(null);
    setAccount(undefined);
    setCredentialVersion((version) => version + 1);
    applySettingsPatch({ dataSource: "mock" });
  }

  return (
    <HashRouter>
      <RouteTelemetry />
      <AppShell
        dataSource={settings.dataSource}
        onCycleTheme={cycleTheme}
        profileName={profileName}
        theme={settings.theme}
      >
        <Routes>
          <Route path="/" element={<LauncherScreen data={query.data} state={screenState} />} />
          <Route
            path="/dashboard"
            element={
              <DashboardScreen
                data={query.data}
                onSaveTopics={async (owner, repo, topics) => {
                  if (!credentialProvider) throw new Error("Connect a GitHub PAT first.");
                  await updateRepositoryTopics(settings, owner, repo, topics, credentialProvider);
                  await query.refetch();
                }}
                onUpdateSettings={applySettingsPatch}
                settings={settings}
                topicsEditable={settings.dataSource === "live" && credentialProvider !== null}
                state={screenState}
              />
            }
          />
          <Route
            path="/pull-requests"
            element={
              <PullRequestsScreen
                data={query.data}
                onMergePullRequest={(pullRequest) => {
                  if (!credentialProvider) throw new Error("Connect a GitHub PAT first.");
                  return mergePullRequest(settings, pullRequest, credentialProvider);
                }}
                onUpdateSettings={applySettingsPatch}
                settings={settings}
                state={screenState}
              />
            }
          />
          <Route
            path="/workflows"
            element={
              <WorkflowsScreen
                data={query.data}
                onUpdateSettings={applySettingsPatch}
                settings={settings}
                state={screenState}
              />
            }
          />
          <Route
            path="/repositories/:owner/:repo"
            element={<RepositoryDetailScreen data={query.data} state={screenState} />}
          />
          <Route
            path="/settings"
            element={
              <SettingsScreen
                onResetSettings={resetSettings}
                onUpdateSettings={applySettingsPatch}
                connectedAccount={account}
                credentialReady={credentialReady}
                hasSharedCredential={sharedCredentialAvailable}
                onConnectWithPat={connectWithPat}
                onConnectWithSharedPat={connectWithSharedPat}
                onDisconnectPat={disconnectPat}
                settings={settings}
              />
            }
          />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}

function RouteTelemetry() {
  const location = useLocation();

  useEffect(() => {
    logger.info({ route: location.pathname }, "Route viewed");
  }, [location.pathname]);

  return null;
}
