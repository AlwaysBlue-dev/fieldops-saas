import {
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Sun,
  Users,
  BriefcaseBusiness,
  BarChart3,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function desktopPrimaryNav(orgSlug: string): AppNavItem[] {
  const base = `/app/${orgSlug}`;
  return [
    { href: `${base}/overview`, label: "Overview", icon: LayoutDashboard },
    { href: `${base}/my-day`, label: "My Day", icon: Sun },
    { href: `${base}/schedule`, label: "Schedule", icon: CalendarDays },
    { href: `${base}/jobs`, label: "Jobs", icon: FolderKanban },
    { href: `${base}/clients`, label: "Clients", icon: BriefcaseBusiness },
    { href: `${base}/teams`, label: "Teams", icon: Users },
    { href: `${base}/time`, label: "Time", icon: Clock3 },
    { href: `${base}/approvals`, label: "Approvals", icon: ClipboardCheck },
    { href: `${base}/reports`, label: "Reports", icon: BarChart3 },
  ];
}

export function desktopSecondaryNav(orgSlug: string): AppNavItem[] {
  return [
    { href: `/app/${orgSlug}/settings`, label: "Settings", icon: Settings },
  ];
}

export const helpNavItem: AppNavItem = {
  href: "#help",
  label: "Help",
  icon: HelpCircle,
};

export function mobilePrimaryNav(
  orgSlug: string,
  role?: "OWNER" | "ADMIN" | "OPERATIONS_MANAGER" | "SUPERVISOR" | "TECHNICIAN",
): AppNavItem[] {
  const base = `/app/${orgSlug}`;
  const home =
    role === "TECHNICIAN"
      ? { href: `${base}/my-day`, label: "Home", icon: Sun }
      : { href: `${base}/overview`, label: "Home", icon: LayoutDashboard };
  return [
    home,
    { href: `${base}/jobs`, label: "Jobs", icon: FolderKanban },
    { href: `${base}/schedule`, label: "Schedule", icon: CalendarDays },
    { href: `${base}/time`, label: "Time", icon: Clock3 },
  ];
}

export function pageTitleFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const segment = parts.at(-1) ?? "overview";
  if (parts.includes("technicians")) {
    return "Technician";
  }
  if (parts.includes("clients") && segment !== "clients") {
    return "Client";
  }
  if (parts.includes("teams") && segment !== "teams") {
    return "Team";
  }
  if (parts.includes("jobs") && segment === "new") {
    return "New job";
  }
  if (parts.includes("jobs") && segment !== "jobs") {
    return "Job";
  }
  const titles: Record<string, string> = {
    overview: "Overview",
    "my-day": "My Day",
    schedule: "Schedule",
    jobs: "Jobs",
    clients: "Clients",
    teams: "Teams",
    time: "Time",
    approvals: "Approvals",
    reports: "Reports",
    settings: "Settings",
  };
  return titles[segment] ?? "FieldOps";
}
