"use client";

import { ApiError } from "@/lib/api";
import type { OrganizationMembership } from "@/lib/auth";
import {
  getOrganizationSubscription,
  type OrganizationSubscription,
} from "@/lib/subscription";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SubscriptionContextValue = {
  subscription: OrganizationSubscription | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({
  organizationId,
  children,
}: {
  organizationId: string | null;
  children: ReactNode;
}) {
  const [subscription, setSubscription] =
    useState<OrganizationSubscription | null>(null);
  const [resolvedId, setResolvedId] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      return;
    }
    let cancelled = false;
    getOrganizationSubscription(organizationId)
      .then((next) => {
        if (cancelled) return;
        setSubscription(next);
        setResolvedId(organizationId);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (!(error instanceof ApiError && error.status === 401)) {
          setSubscription(null);
          setResolvedId(organizationId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const value = useMemo<SubscriptionContextValue>(() => {
    const matched = Boolean(organizationId) && resolvedId === organizationId;
    return {
      subscription: matched ? subscription : null,
      loading: Boolean(organizationId) && !matched,
      refresh: async () => {
        if (!organizationId) return;
        const next = await getOrganizationSubscription(organizationId);
        setSubscription(next);
        setResolvedId(organizationId);
      },
    };
  }, [organizationId, resolvedId, subscription]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    return {
      subscription: null,
      loading: false,
      refresh: async () => undefined,
    };
  }
  return context;
}

export function membershipOrganizationId(
  memberships: OrganizationMembership[],
  orgSlug: string,
) {
  return (
    memberships.find((item) => item.organization.slug === orgSlug)?.organization
      .id ?? null
  );
}
