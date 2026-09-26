import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { StatusPill } from "./StatusPill.tsx";

export interface AppShellProps {
  readonly children?: React.ReactNode;
  readonly profileName: string;
  readonly dataSource: "mock" | "live";
  readonly theme: "system" | "light" | "dark";
  readonly onCycleTheme: () => void;
}

const navigation = [
  { to: "/", label: "Launcher", end: true },
  { to: "/dashboard", label: "Dashboard", end: false },
  { to: "/pull-requests", label: "PR Hub", end: false },
  { to: "/workflows", label: "Workflows", end: false },
  { to: "/settings", label: "Settings", end: false },
] as const;

export function AppShell({
  children,
  dataSource,
  onCycleTheme,
  profileName,
  theme,
}: AppShellProps) {
  const location = useLocation();
  const primaryAction = getPrimaryAction(location.pathname);

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="container topnav-inner">
          <span className="logo">Project Control</span>
          <nav aria-label="Primary">
            <ul className="nav-list">
              {navigation.map((item) => (
                <li key={item.to}>
                  <NavLink className="nav-link" to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="topnav__actions">
            <StatusPill tone={dataSource === "live" ? "success" : "accent"}>
              {dataSource === "live" ? `Live GitHub · ${profileName}` : "Mock data"}
            </StatusPill>
            <Link
              className={primaryAction.primary ? "btn btn-primary" : "btn"}
              to={primaryAction.to}
            >
              {primaryAction.label}
            </Link>
            <button
              aria-label={`Cycle theme, current theme ${theme}`}
              className="theme-toggle"
              title={`Theme: ${theme}`}
              type="button"
              onClick={onCycleTheme}
            >
              ◐
            </button>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

function getPrimaryAction(
  pathname: string,
): { readonly label: string; readonly to: string; readonly primary: boolean } {
  if (pathname.startsWith("/pull-requests")) {
    return { label: "Review workflow alerts", to: "/workflows", primary: true };
  }

  if (pathname.startsWith("/workflows")) {
    return { label: "Back to dashboard", to: "/dashboard", primary: false };
  }

  if (pathname.startsWith("/repositories")) {
    return { label: "All repos", to: "/dashboard", primary: false };
  }

  if (pathname.startsWith("/settings")) {
    return { label: "Back to dashboard", to: "/dashboard", primary: false };
  }

  return { label: "Open PR Hub", to: "/pull-requests", primary: false };
}
