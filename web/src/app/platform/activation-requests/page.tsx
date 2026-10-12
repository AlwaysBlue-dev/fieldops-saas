"use client";

import { Button } from "@/components/ui/button";
import { updateDiscountedPlatformInvoice } from "@/lib/billing";
import { ApiError } from "@/lib/api";
import {
  listActivationRequests,
  listCommercialRequests,
  platformActivate,
  updateCommercialRequest,
  type PlatformCommercialRequest,
} from "@/lib/platform";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function PlatformActivationRequestsPage() {
  const [rows, setRows] = useState<PlatformCommercialRequest[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function refresh() {
    const [activations, planChanges] = await Promise.all([
      listActivationRequests(),
      listCommercialRequests({ requestType: "PLAN_CHANGE" }),
    ]);
    setRows([...activations, ...planChanges].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listActivationRequests(),
      listCommercialRequests({ requestType: "PLAN_CHANGE" }),
    ])
      .then(([activations, planChanges]) => {
        if (!cancelled) setRows([...activations, ...planChanges].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function mark(
    requestId: string,
    status: "CONTACTED" | "COMPLETED" | "CLOSED",
  ) {
    setMessage(null);
    setPendingId(requestId);
    try {
      await updateCommercialRequest(requestId, status);
      await refresh();
      setMessage(
        status === "CONTACTED"
          ? "Marked contacted."
          : status === "CLOSED"
            ? "Request closed."
            : "Request updated.",
      );
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Update failed.");
    } finally {
      setPendingId(null);
    }
  }

  async function sendDiscountedInvoice(row: PlatformCommercialRequest, invoiceId: string, termYears: number) {
    setMessage(null);
    setPendingId(row.id);
    try {
      await updateDiscountedPlatformInvoice(invoiceId, row.id, termYears);
      await refresh();
      setMessage(`Invoice updated to ${termYears} years and sent to the workspace billing contacts.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Invoice could not be updated.");
    } finally {
      setPendingId(null);
    }
  }

  async function activateFromRequest(row: PlatformCommercialRequest) {
    setMessage(null);
    setPendingId(row.id);
    try {
      await platformActivate(row.organizationId, {
        planCode: "professional",
      });
      await refresh();
      setMessage("Organization activated. Open request closed.");
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "Activation failed.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Activation requests
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tenant users cannot self-activate. Contact the owner, then activate or
        close the request.
      </p>
      <div className="mt-6 scroll-x-pane rounded-lg border border-border bg-card">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Organization</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Requested</th>
              <th className="px-3 py-2 font-medium">Message</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => {
              const owner = row.owner ?? row.requestedBy;
              const busy = pendingId === row.id;
              const invoiceId = row.message?.match(/Invoice ID:\s*([0-9a-f-]{36})/i)?.[1];
              const termYears = Number(row.message?.match(/Requested term:\s*(\d+)\s+years?/i)?.[1]);
              const isDiscountedInvoiceRequest = Boolean(invoiceId && termYears >= 2 && termYears <= 5);
              return (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 align-top"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/organizations/${row.organizationId}`}
                      className="font-medium text-primary"
                    >
                      {row.organization.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.organization.slug}
                    </p>
                  </td>
                  <td className="px-3 py-2">{owner.fullName}</td>
                  <td className="px-3 py-2">{row.email ?? owner.email}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(
                      row.requestedDate ?? row.createdAt,
                    ).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 max-w-[14rem]">
                    <p className="line-clamp-3 text-muted-foreground">
                      {row.message || "—"}
                    </p>
                  </td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        className="h-8"
                        variant="outline"
                        disabled={busy || row.status === "CONTACTED"}
                        onClick={() => mark(row.id, "CONTACTED")}
                      >
                        Mark contacted
                      </Button>
                      {!isDiscountedInvoiceRequest ? (
                        <Button
                          className="h-8"
                          variant="outline"
                          disabled={busy || row.status === "CLOSED" || row.status === "COMPLETED"}
                          onClick={() => activateFromRequest(row)}
                        >
                          Activate organization
                        </Button>
                      ) : null}
                      {isDiscountedInvoiceRequest ? (
                        <Button
                          className="h-8"
                          disabled={busy || row.status === "CLOSED" || row.status === "COMPLETED"}
                          onClick={() => void sendDiscountedInvoice(row, invoiceId!, termYears)}
                        >
                          {busy ? "Sending…" : `Update & send ${termYears}-year invoice`}
                        </Button>
                      ) : null}
                      <Button
                        className="h-8"
                        variant="outline"
                        disabled={busy || row.status === "CLOSED"}
                        onClick={() => mark(row.id, "CLOSED")}
                      >
                        Close
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows && rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No activation requests.
          </p>
        ) : null}
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </div>
  );
}
