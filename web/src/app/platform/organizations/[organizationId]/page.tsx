"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  formatBytes,
  getPlatformOrganization,
  listPlatformPlans,
  platformActivate,
  platformCancel,
  platformChangePlan,
  platformExtendTrial,
  platformReactivate,
  platformRenew,
  platformSetPeriod,
  platformSuspend,
  type PlatformOrganization,
} from "@/lib/platform";
import type { SubscriptionPlan } from "@/lib/subscription";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const ACTIVATION_PLANS = ["starter", "professional", "business"] as const;

function defaultEndOneYear(startIsoDate: string) {
  if (!startIsoDate) return "";
  const d = new Date(`${startIsoDate}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function PlatformOrganizationPage() {
  const params = useParams<{ organizationId: string }>();
  const [row, setRow] = useState<PlatformOrganization | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [planCode, setPlanCode] = useState("professional");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customTrialDate, setCustomTrialDate] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const activationPlans = useMemo(
    () =>
      plans.filter((plan) =>
        (ACTIVATION_PLANS as readonly string[]).includes(plan.code),
      ),
    [plans],
  );

  const apply = useCallback(
    (next: PlatformOrganization, catalog: SubscriptionPlan[], seedDates: boolean) => {
      setRow(next);
      setPlans(catalog);
      if (next.subscription?.plan.code) {
        setPlanCode(next.subscription.plan.code);
      }
      if (seedDates) {
        const start =
          next.subscription?.currentPeriodStart?.slice(0, 10) ??
          new Date().toISOString().slice(0, 10);
        setStartDate(start);
        setEndDate(
          next.subscription?.currentPeriodEnd?.slice(0, 10) ??
            defaultEndOneYear(start),
        );
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getPlatformOrganization(params.organizationId),
      listPlatformPlans(),
    ])
      .then(([next, catalog]) => {
        if (!cancelled) apply(next, catalog, true);
      })
      .catch(() => {
        if (!cancelled) setRow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apply, params.organizationId]);

  async function run(label: string, work: () => Promise<unknown>) {
    setPending(true);
    setMessage(null);
    try {
      await work();
      const [next, catalog] = await Promise.all([
        getPlatformOrganization(params.organizationId),
        listPlatformPlans(),
      ]);
      apply(next, catalog, false);
      setMessage(label);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }

  if (!row) {
    return (
      <p className="text-sm text-muted-foreground">Loading organization…</p>
    );
  }

  const dates = {
    planCode,
    currentPeriodStart: startDate || undefined,
    currentPeriodEnd: endDate || undefined,
  };

  return (
    <div className="max-w-3xl">
      <Link
        href="/platform/organizations"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Organizations
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{row.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{row.slug}</p>

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Company</dt>
          <dd className="font-medium">{row.name}</dd>
          <dd className="text-xs text-muted-foreground">{row.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Owner</dt>
          <dd className="font-medium">{row.owner?.fullName ?? "—"}</dd>
          <dd className="text-xs text-muted-foreground">
            {row.owner?.email ?? ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Owner free trial used</dt>
          <dd className="font-medium">
            {row.owner?.trialUsed == null
              ? "—"
              : row.owner.trialUsed
                ? "Yes"
                : "No"}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {row.owner?.trialUsedAt
              ? `First used ${new Date(row.owner.trialUsedAt).toLocaleDateString()}`
              : "Never used"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>
            {row.createdAt
              ? new Date(row.createdAt).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Timezone</dt>
          <dd>{row.timezone ?? "—"}</dd>
        </div>
      </dl>

      <section className="mt-8 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Billing contact</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Default contact for invoices and payment reconciliation. Resolved from
          the organization Owner membership.
        </p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="font-medium">{row.owner?.fullName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{row.owner?.email ?? "—"}</dd>
          </div>
        </dl>
        <Link
          href={`/platform/invoices?organizationId=${row.id}`}
          className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
        >
          View organization invoices
        </Link>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Subscription</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-medium">
              {row.subscription?.plan.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium">
              {row.subscription?.effectiveStatus.replaceAll("_", " ") ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trial started</dt>
            <dd>
              {row.subscription?.trialStartedAt
                ? new Date(row.subscription.trialStartedAt).toLocaleDateString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trial ends</dt>
            <dd>
              {row.subscription?.trialEndsAt
                ? new Date(row.subscription.trialEndsAt).toLocaleDateString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Grace ends</dt>
            <dd>
              {row.subscription?.graceEndsAt
                ? new Date(row.subscription.graceEndsAt).toLocaleDateString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Activated</dt>
            <dd>
              {row.subscription?.activatedAt
                ? new Date(row.subscription.activatedAt).toLocaleString()
                : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Current period</dt>
            <dd>
              {row.subscription?.currentPeriodStart
                ? `${new Date(row.subscription.currentPeriodStart).toLocaleDateString()} – ${row.subscription.currentPeriodEnd ? new Date(row.subscription.currentPeriodEnd).toLocaleDateString() : "—"}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Usage</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Members</dt>
            <dd className="font-medium">{row.usage?.members ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Jobs</dt>
            <dd className="font-medium">{row.usage?.jobs ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Storage</dt>
            <dd className="font-medium">
              {formatBytes(row.usage?.storageBytes)}
              {row.usage?.storageIncludedBytes
                ? ` / ${formatBytes(row.usage.storageIncludedBytes)}`
                : ""}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 space-y-4 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Activate / renew</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="planCode">Plan</Label>
            <select
              id="planCode"
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value)}
            >
              {(activationPlans.length > 0 ? activationPlans : plans).map(
                (plan) => (
                  <option key={plan.id} value={plan.code}>
                    {plan.name}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <Label htmlFor="startDate">Start date</Label>
            <Input
              id="startDate"
              type="date"
              className="mt-1 h-11"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (!endDate) {
                  setEndDate(defaultEndOneYear(event.target.value));
                }
              }}
            />
          </div>
          <div>
            <Label htmlFor="endDate">End date</Label>
            <Input
              id="endDate"
              type="date"
              className="mt-1 h-11"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Default end date is one year after start and remains editable.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-11"
            disabled={pending}
            onClick={() =>
              run("Organization activated.", () =>
                platformActivate(row.id, dates),
              )
            }
          >
            Activate subscription
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("Renewed.", () => platformRenew(row.id, dates))
            }
          >
            Renew
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("Plan updated.", () => platformChangePlan(row.id, planCode))
            }
          >
            Change plan
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={pending || !startDate || !endDate}
            onClick={() =>
              run("Period updated.", () =>
                platformSetPeriod(row.id, {
                  currentPeriodStart: startDate,
                  currentPeriodEnd: endDate,
                }),
              )
            }
          >
            Set period
          </Button>
        </div>
      </section>

      <section className="mt-4 space-y-3 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Extend trial</h2>
        <div className="flex flex-wrap gap-2">
          {[7, 14, 30].map((days) => (
            <Button
              key={days}
              className="h-11"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(`Trial extended by ${days} days.`, () =>
                  platformExtendTrial(row.id, { days }),
                )
              }
            >
              +{days} days
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="customTrial">Custom end date</Label>
            <Input
              id="customTrial"
              type="date"
              className="mt-1 h-11"
              value={customTrialDate}
              onChange={(event) => setCustomTrialDate(event.target.value)}
            />
          </div>
          <Button
            className="h-11"
            variant="outline"
            disabled={pending || !customTrialDate}
            onClick={() =>
              run("Trial extended to custom date.", () =>
                platformExtendTrial(row.id, {
                  trialEndsAt: customTrialDate,
                }),
              )
            }
          >
            Set trial end
          </Button>
        </div>
      </section>

      <section className="mt-4 space-y-3 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Suspend / reactivate / cancel</h2>
        <div>
          <Label htmlFor="suspendReason">Suspension reason</Label>
          <Input
            id="suspendReason"
            className="mt-1 h-11"
            value={suspendReason}
            onChange={(event) => setSuspendReason(event.target.value)}
            placeholder="Required to suspend"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-11"
            variant="outline"
            disabled={pending || suspendReason.trim().length < 3}
            onClick={() =>
              run("Suspended.", () =>
                platformSuspend(row.id, suspendReason.trim()),
              )
            }
          >
            Suspend
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("Reactivated.", () => platformReactivate(row.id))
            }
          >
            Reactivate
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={pending}
            onClick={() => run("Cancelled.", () => platformCancel(row.id))}
          >
            Cancel
          </Button>
        </div>
      </section>

      {message ? <p className="mt-4 text-sm">{message}</p> : null}
    </div>
  );
}
