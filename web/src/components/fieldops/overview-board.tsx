"use client";

import { Button } from "@/components/ui/button";
import { getMe, getMyOrganizations } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityTimeline } from "./activity-timeline";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { MetricCard } from "./metric-card";
import { PageHeader } from "./page-header";
import { SkeletonBlock } from "./skeleton-block";
import { StatusPill } from "./status-pill";

type BoardState = "loading" | "empty" | "error";

export function OverviewBoard({ orgSlug }: { orgSlug: string }) {
  const [state, setState] = useState<BoardState>("loading");
  const [dayLabel, setDayLabel] = useState("");
  const [orgName, setOrgName] = useState("Organization");
  const [userName, setUserName] = useState("");

  const applyBoard = useCallback(
    (fullName: string, organizationName: string) => {
      setUserName(fullName);
      setOrgName(organizationName);
      setDayLabel(
        new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date()),
      );
      setState("empty");
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMe(), getMyOrganizations()])
      .then(([{ user }, memberships]) => {
        if (cancelled) return;
        applyBoard(
          user.fullName,
          memberships.find((item) => item.organization.slug === orgSlug)
            ?.organization.name ?? "Organization",
        );
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyBoard, orgSlug]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [{ user }, memberships] = await Promise.all([
        getMe(),
        getMyOrganizations(),
      ]);
      applyBoard(
        user.fullName,
        memberships.find((item) => item.organization.slug === orgSlug)
          ?.organization.name ?? "Organization",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState("error");
        return;
      }
      setState("error");
    }
  }, [applyBoard, orgSlug]);

  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <div className="mx-auto flex max-w-350 flex-col gap-4">
      <PageHeader
        title={`Good ${greeting()}, ${firstName}`}
        description={`${orgName} · ${dayLabel || "Operational day"}`}
        actions={
          <StatusPill label="Workspace ready" tone="cobalt" />
        }
      />

      {state === "loading" ? <SkeletonBlock rows={7} /> : null}
      {state === "error" ? (
        <ErrorState
          title="Overview is unavailable"
          description="The workspace could not refresh operational data."
          onRetry={() => void load()}
        />
      ) : null}

      {state === "empty" ? (
        <>
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="grid grid-cols-2 md:grid-cols-4">
              <MetricCard label="Open jobs" value="—" hint="No jobs loaded" />
              <MetricCard label="In field" value="—" hint="Crews idle" />
              <MetricCard label="Approvals" value="—" hint="Inbox empty" />
              <MetricCard label="Hours today" value="—" hint="No clocks" />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
            <Pane
              title="Today's work"
              action={<Button variant="outline">Open schedule</Button>}
            >
              <EmptyState
                title="No work on the board"
                description="Jobs scheduled for today will land here once dispatch is connected."
              />
            </Pane>
            <Pane title="Active crews">
              <EmptyState
                title="No crews clocked in"
                description="Live technician status appears when a clock session is open."
              />
            </Pane>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Pane title="Needs attention">
              <EmptyState
                title="Nothing needs action"
                description="Overdue, unassigned, or blocked jobs will collect here."
              />
            </Pane>
            <Pane title="Upcoming schedule">
              <EmptyState
                title="No upcoming visits"
                description="The next window of scheduled jobs will list here."
              />
            </Pane>
            <Pane title="Approval inbox">
              <EmptyState
                title="Inbox is clear"
                description="Time, overtime, and job completions awaiting review will appear here."
              />
            </Pane>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Pane title="Technician activity">
              <ActivityTimeline
                items={[]}
                empty={
                  <EmptyState
                    title="No activity yet"
                    description="Clock events and job transitions will stream into this timeline."
                  />
                }
              />
            </Pane>
            <Pane title="Operational trend">
              <div className="flex h-40 items-end gap-1.5 px-1">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-sm bg-muted"
                    style={{ height: `${28 + ((index * 17) % 48)}%` }}
                    aria-hidden
                  />
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Trend bars stay schematic until reporting data is connected.
                No production volumes are shown.
              </p>
            </Pane>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Pane({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
