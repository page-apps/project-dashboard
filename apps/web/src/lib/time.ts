const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const differenceInMinutes = Math.round((timestamp - Date.now()) / 60_000);

  if (Math.abs(differenceInMinutes) < 60) {
    return relativeFormatter.format(differenceInMinutes, "minute");
  }

  const differenceInHours = Math.round(differenceInMinutes / 60);

  if (Math.abs(differenceInHours) < 24) {
    return relativeFormatter.format(differenceInHours, "hour");
  }

  const differenceInDays = Math.round(differenceInHours / 24);
  return relativeFormatter.format(differenceInDays, "day");
}
