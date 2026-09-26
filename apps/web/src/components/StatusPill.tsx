import React, { type ReactNode } from "react";

export interface StatusPillProps {
  readonly tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  readonly children: ReactNode;
}

export function StatusPill({ tone = "neutral", children }: StatusPillProps) {
  return <span className={mapToneToClassName(tone)}>{children}</span>;
}

function mapToneToClassName(tone: StatusPillProps["tone"]): string {
  switch (tone) {
    case "success":
      return "pill pill--ok";
    case "warning":
      return "pill pill--warn";
    case "danger":
      return "pill pill--danger";
    case "accent":
      return "pill pill--accent";
    case "neutral":
    default:
      return "pill";
  }
}
