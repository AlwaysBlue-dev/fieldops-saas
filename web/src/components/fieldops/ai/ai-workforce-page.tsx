"use client";

import { AiChatHeader } from "./ai-chat-header";
import { AiConversationSidebar } from "./ai-conversation-sidebar";
import { AiMessageComposer } from "./ai-message-composer";
import { AiMessageList } from "./ai-message-list";
import { AiProposalsInboxPanel } from "./ai-proposals-inbox";
import { AiWelcomeScreen } from "./ai-welcome-screen";
import { mapApiMessage, type AiUiMessage } from "./types";
import { ErrorState } from "@/components/fieldops/error-state";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { Button } from "@/components/ui/button";
import { ApiError, SessionExpiredError } from "@/lib/api";
import {
  AI_SESSION_LIST_LIMIT,
  AI_SESSION_MESSAGE_LIMIT,
  aiExecutionBannerText,
  aiFriendlyError,
  clearPendingAiRequest,
  createAiSession,
  decideAiProposal,
  deleteAiSession,
  findNewestPendingAiRequest,
  getAiProposal,
  getAiSession,
  getAiUsage,
  isAiAbortError,
  isAiPlanLimitError,
  listAiProposals,
  listAiSessions,
  newAiClientRequestId,
  readPendingAiRequest,
  renameAiSession,
  sendAiMessageWithReconcile,
  transcriptHasUserContent,
  writePendingAiRequest,
  type AiProposalDetail,
  type AiProposalSummary,
  type AiSessionSummary,
  type AiUsageSummary,
} from "@/lib/ai";
import { resolveCurrentMembership } from "@/lib/current-org";
import { cn } from "cn";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PendingSend = {
  sessionId: string;
  clientRequestId: string;
  content: string;
  createdAt: number;
};

type BannerState = {
  tone: "error" | "warning" | "info";
  text: string;
};

export function AiWorkforcePage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const [sessions, setSessions] = useState<AiSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiUiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageLimitReached, setMessageLimitReached] = useState(false);

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<string | undefined>();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);

  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageUnavailable, setUsageUnavailable] = useState(false);

  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [reviewProposals, setReviewProposals] = useState<AiProposalSummary[]>(
    [],
  );
  const [proposalDetails, setProposalDetails] = useState<
    Record<string, AiProposalDetail>
  >({});

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /** Shared create + send mutex (prevents duplicate sessions / overlapping sends). */
  const actionLock = useRef(false);
  const lockOwnerRef = useRef<symbol | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const organizationIdRef = useRef<string | null>(null);
  const messagesGenRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const pendingSendRef = useRef<PendingSend | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    organizationIdRef.current = organizationId;
  }, [organizationId]);

  useEffect(() => {
    pendingSendRef.current = pendingSend;
  }, [pendingSend]);

  /** Friendly “still working” copy while a live request is in flight. */
  useEffect(() => {
    if (!submitting) return;
    setPendingLabel("Looking up operations data…");
    const soft = window.setTimeout(() => {
      setPendingLabel(
        "Still working — this can take up to about a minute for larger lookups…",
      );
    }, 25_000);
    return () => {
      window.clearTimeout(soft);
    };
  }, [submitting]);

  const persistPending = useCallback(
    (
      orgId: string,
      pending: PendingSend | null,
      clearSessionId?: string,
    ) => {
      if (!pending) {
        if (clearSessionId) clearPendingAiRequest(orgId, clearSessionId);
        return;
      }
      writePendingAiRequest({
        organizationId: orgId,
        sessionId: pending.sessionId,
        clientRequestId: pending.clientRequestId,
        content: pending.content,
        createdAt: pending.createdAt,
      });
    },
    [],
  );

  const setPending = useCallback(
    (orgId: string | null, pending: PendingSend | null) => {
      const previousSessionId = pendingSendRef.current?.sessionId;
      setPendingSend(pending);
      pendingSendRef.current = pending;
      if (!orgId) return;
      if (pending) {
        persistPending(orgId, pending);
      } else if (previousSessionId) {
        persistPending(orgId, null, previousSessionId);
      }
    },
    [persistPending],
  );

  const abortFrontendWait = useCallback(() => {
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
  }, []);

  /** Release the shared lock without waiting for an aborted runSend finally. */
  const releaseActionLock = useCallback(() => {
    lockOwnerRef.current = null;
    actionLock.current = false;
  }, []);

  const refreshUsage = useCallback(async (orgId: string) => {
    setUsageLoading(true);
    try {
      const next = await getAiUsage(orgId);
      setUsage(next);
      setUsageUnavailable(false);
    } catch {
      setUsageUnavailable(true);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const canReviewProposals =
    orgRole === "OWNER" ||
    orgRole === "ADMIN" ||
    orgRole === "OPERATIONS_MANAGER";

  const refreshProposals = useCallback(async (orgId: string) => {
    setProposalsLoading(true);
    try {
      if (canReviewProposals) {
        const result = await listAiProposals(orgId, {
          scope: "review",
          status: "PENDING",
        });
        setReviewProposals(result.items);
        const active = activeIdRef.current;
        const forSession = result.items.filter((item) => item.sessionId === active);
        await Promise.all(
          forSession.map(async (item) => {
            try {
              const detail = await getAiProposal(orgId, item.id);
              setProposalDetails((prev) => ({ ...prev, [item.id]: detail }));
            } catch {
              // ignore
            }
          }),
        );
      } else {
        const mine = await listAiProposals(orgId, {
          scope: "mine",
          status: "PENDING",
        });
        setReviewProposals([]);
        const active = activeIdRef.current;
        const forSession = mine.items.filter((item) => item.sessionId === active);
        await Promise.all(
          forSession.map(async (item) => {
            try {
              const detail = await getAiProposal(orgId, item.id);
              setProposalDetails((prev) => ({ ...prev, [item.id]: detail }));
            } catch {
              // ignore
            }
          }),
        );
      }
    } catch {
      // Non-fatal: inbox stays empty
    } finally {
      setProposalsLoading(false);
    }
  }, [canReviewProposals]);

  const loadProposalDetail = useCallback(
    async (proposalId: string) => {
      if (!organizationId) return;
      const detail = await getAiProposal(organizationId, proposalId);
      setProposalDetails((prev) => ({ ...prev, [proposalId]: detail }));
    },
    [organizationId],
  );

  const handleDecideProposal = useCallback(
    async (proposalId: string, decision: "APPROVE" | "REJECT") => {
      if (!organizationId) return;
      const updated = await decideAiProposal(organizationId, proposalId, {
        decision,
      });
      setProposalDetails((prev) => ({ ...prev, [proposalId]: updated }));
      await refreshProposals(organizationId);
    },
    [organizationId, refreshProposals],
  );

  useEffect(() => {
    if (!organizationId) return;
    void refreshProposals(organizationId);
  }, [organizationId, activeId, refreshProposals]);

  const sessionProposalDetails = useMemo(() => {
    if (!activeId) return [];
    return Object.values(proposalDetails).filter(
      (p) => p.sessionId === activeId && p.status === "PENDING",
    );
  }, [activeId, proposalDetails]);

  const refreshSessions = useCallback(async (orgId: string) => {
    setSessionsLoading(true);
    try {
      const list = await listAiSessions(orgId);
      setSessions(list);
      return list;
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  /**
   * Load messages for a session. Never clears terminal banners.
   * Stale responses (wrong session / superseded generation) are ignored.
   */
  const loadSessionMessages = useCallback(
    async (
      orgId: string,
      sessionId: string,
      options?: { signal?: AbortSignal },
    ): Promise<{ applied: boolean; messageCount: number } | null> => {
      const gen = ++messagesGenRef.current;

      if (!options?.signal) {
        loadAbortRef.current?.abort();
        const controller = new AbortController();
        loadAbortRef.current = controller;
        options = { signal: controller.signal };
      }

      if (activeIdRef.current === sessionId) {
        setMessagesLoading(true);
        setMessages([]);
        setMessageLimitReached(false);
      }

      try {
        const detail = await getAiSession(orgId, sessionId, options.signal);
        if (
          messagesGenRef.current !== gen ||
          activeIdRef.current !== sessionId
        ) {
          return null;
        }

        const mapped = detail.messages
          .map(mapApiMessage)
          .filter((m): m is AiUiMessage => m !== null);
        setMessages(mapped);
        setMessageLimitReached(
          detail.messagesTruncated === true ||
            detail.messages.length >= AI_SESSION_MESSAGE_LIMIT,
        );
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  title: detail.title,
                  updatedAt: detail.updatedAt,
                  status: detail.status,
                }
              : s,
          ),
        );
        return { applied: true, messageCount: detail.messages.length };
      } catch (error) {
        if (isAiAbortError(error) || options.signal?.aborted) {
          return null;
        }
        if (
          messagesGenRef.current === gen &&
          activeIdRef.current === sessionId
        ) {
          setBanner({
            tone: "error",
            text: aiFriendlyError(error),
          });
        }
        return null;
      } finally {
        if (
          messagesGenRef.current === gen &&
          activeIdRef.current === sessionId
        ) {
          setMessagesLoading(false);
        }
      }
    },
    [],
  );

  const showPendingBannerFor = useCallback((pending: PendingSend) => {
    setBanner({
      tone: "warning",
      text: "A previous AI request may still be running. Use Retry if shown — that continues the same work and will not start a second AI task. Check the conversation before sending a new message.",
    });
    void pending;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootAbort = new AbortController();
    (async () => {
      setBootLoading(true);
      setBootError(null);
      // Org slug change: reset org-scoped UI before loading the next workspace.
      abortFrontendWait();
      releaseActionLock();
      setActiveId(null);
      activeIdRef.current = null;
      setMessages([]);
      setMessageLimitReached(false);
      setMessagesLoading(false);
      setDraft("");
      setBanner(null);
      setPendingSend(null);
      pendingSendRef.current = null;
      setSubmitting(false);
      setPendingLabel(undefined);
      setSessions([]);
      setUsage(null);
      setOrgRole(null);
      setProposalsOpen(false);
      setReviewProposals([]);
      setProposalDetails({});
      setMobileSidebarOpen(false);

      try {
        const membership = await resolveCurrentMembership(orgSlug);
        if (!membership) {
          throw new Error("Organization not found for this account.");
        }
        if (cancelled) return;
        const orgId = membership.organization.id;
        setOrganizationId(orgId);
        organizationIdRef.current = orgId;
        setOrgRole(membership.role);

        const [list] = await Promise.all([
          refreshSessions(orgId),
          refreshUsage(orgId),
          refreshProposals(orgId),
        ]);
        if (cancelled) return;

        const restored = findNewestPendingAiRequest(orgId);
        if (restored) {
          const pending: PendingSend = {
            sessionId: restored.sessionId,
            clientRequestId: restored.clientRequestId,
            content: restored.content,
            createdAt: restored.createdAt,
          };
          setPendingSend(pending);
          pendingSendRef.current = pending;
          const known = list?.some((s) => s.id === restored.sessionId);
          if (known) {
            setActiveId(restored.sessionId);
            activeIdRef.current = restored.sessionId;
            showPendingBannerFor(pending);
            await loadSessionMessages(orgId, restored.sessionId, {
              signal: bootAbort.signal,
            });
          } else {
            showPendingBannerFor(pending);
          }
        }
      } catch (error) {
        if (!cancelled && !isAiAbortError(error)) {
          setBootError(aiFriendlyError(error));
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      bootAbort.abort();
      loadAbortRef.current?.abort();
      sendAbortRef.current?.abort();
    };
  }, [
    abortFrontendWait,
    loadSessionMessages,
    orgSlug,
    refreshProposals,
    refreshSessions,
    refreshUsage,
    releaseActionLock,
    showPendingBannerFor,
  ]);

  const isSessionBusy = useCallback(
    (sessionId: string) => {
      if (pendingSend?.sessionId === sessionId) return true;
      if (submitting && activeIdRef.current === sessionId) return true;
      if (!organizationId) return false;
      return Boolean(readPendingAiRequest(organizationId, sessionId));
    },
    [organizationId, pendingSend, submitting],
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      if (!organizationId) {
        throw new Error("Organization is not ready.");
      }
      const updated = await renameAiSession(organizationId, sessionId, title);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                title: updated.title,
                updatedAt: updated.updatedAt,
                status: updated.status,
              }
            : s,
        ),
      );
    },
    [organizationId],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!organizationId) {
        throw new Error("Organization is not ready.");
      }
      if (isSessionBusy(sessionId)) {
        throw new Error(
          "A request is still running in this conversation. Wait for it to finish, then try again.",
        );
      }
      await deleteAiSession(organizationId, sessionId);
      clearPendingAiRequest(organizationId, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (pendingSendRef.current?.sessionId === sessionId) {
        setPendingSend(null);
        pendingSendRef.current = null;
        setBanner(null);
        setSubmitting(false);
        setPendingLabel(undefined);
      }

      if (activeIdRef.current === sessionId) {
        messagesGenRef.current += 1;
        setActiveId(null);
        activeIdRef.current = null;
        setMessages([]);
        setMessageLimitReached(false);
        setMessagesLoading(false);
        setDraft("");
      }
    },
    [isSessionBusy, organizationId],
  );

  const handleNewChat = useCallback(async () => {
    if (!organizationId || actionLock.current || creatingSession || submitting) {
      return;
    }
    // Already on an empty draft — reuse it instead of stacking "New chat" rows.
    if (
      activeIdRef.current &&
      !messagesLoading &&
      messages.length === 0
    ) {
      setDraft("");
      setBanner(null);
      setMobileSidebarOpen(false);
      return;
    }
    actionLock.current = true;
    const owner = Symbol("ai-new-chat");
    lockOwnerRef.current = owner;
    setCreatingSession(true);
    setBanner(null);
    abortFrontendWait();
    try {
      const session = await createAiSession(organizationId);
      // Server archives other empty drafts on create — refresh so they leave the sidebar.
      await refreshSessions(organizationId);
      messagesGenRef.current += 1;
      setActiveId(session.id);
      activeIdRef.current = session.id;
      setMessages([]);
      setMessageLimitReached(false);
      setMessagesLoading(false);
      setDraft("");
      setMobileSidebarOpen(false);
      // Keep pending for another session; do not invent a new clientRequestId.
    } catch (error) {
      setBanner({ tone: "error", text: aiFriendlyError(error) });
    } finally {
      setCreatingSession(false);
      if (lockOwnerRef.current === owner) {
        releaseActionLock();
      }
    }
  }, [
    abortFrontendWait,
    creatingSession,
    messages.length,
    messagesLoading,
    organizationId,
    refreshSessions,
    releaseActionLock,
    submitting,
  ]);

  const handleSelect = useCallback(
    async (id: string) => {
      if (!organizationId) return;
      if (id === activeIdRef.current && !messagesLoading) return;

      // Cancel frontend waiting only — backend work for pendingSend continues.
      abortFrontendWait();
      setSubmitting(false);
      setPendingLabel(undefined);
      releaseActionLock();

      setActiveId(id);
      activeIdRef.current = id;
      setDraft("");
      setMobileSidebarOpen(false);
      setMessages([]);
      setMessagesLoading(true);
      setMessageLimitReached(false);

      // Restore this session's pending from sessionStorage (other sessions stay stored).
      const stored = readPendingAiRequest(organizationId, id);
      if (stored) {
        const pending: PendingSend = {
          sessionId: stored.sessionId,
          clientRequestId: stored.clientRequestId,
          content: stored.content,
          createdAt: stored.createdAt,
        };
        setPendingSend(pending);
        pendingSendRef.current = pending;
        showPendingBannerFor(pending);
      } else if (pendingSendRef.current?.sessionId === id) {
        showPendingBannerFor(pendingSendRef.current);
      } else if (
        pendingSendRef.current &&
        pendingSendRef.current.sessionId !== id
      ) {
        // Keep in-memory pending for the other session; clear unrelated banners.
        setBanner(null);
      } else {
        setBanner(null);
      }

      await loadSessionMessages(organizationId, id);
    },
    [
      abortFrontendWait,
      loadSessionMessages,
      messagesLoading,
      organizationId,
      releaseActionLock,
      showPendingBannerFor,
    ],
  );

  const handleAbandonPending = useCallback(() => {
    if (!organizationId) return;
    abortFrontendWait();
    setPending(organizationId, null);
    setBanner(null);
    setSubmitting(false);
    setPendingLabel(undefined);
    releaseActionLock();
    setMessages((prev) => prev.filter((m) => !m.optimistic));
  }, [abortFrontendWait, organizationId, releaseActionLock, setPending]);

  const runSend = useCallback(
    async (input: PendingSend, options?: { alreadyLocked?: boolean }) => {
      if (!organizationId) return;
      if (!options?.alreadyLocked) {
        if (actionLock.current) return;
        actionLock.current = true;
      }
      const owner = Symbol("ai-send");
      lockOwnerRef.current = owner;

      abortFrontendWait();
      const controller = new AbortController();
      sendAbortRef.current = controller;

      const isRetrySameRequest =
        pendingSendRef.current?.clientRequestId === input.clientRequestId;

      setSubmitting(true);
      setPendingLabel("Looking up operations data…");
      setBanner(null);
      setPending(organizationId, input);

      // Optimistic meter: PENDING holds quota until the server settles.
      if (!isRetrySameRequest) {
        setUsage((prev) => {
          if (!prev?.enabled || prev.remaining <= 0) return prev;
          return {
            ...prev,
            used: Math.min(prev.limit, prev.used + 1),
            remaining: Math.max(0, prev.remaining - 1),
          };
        });
      }

      const viewingThisSession = () => activeIdRef.current === input.sessionId;
      const optimisticId = `optimistic-${input.clientRequestId}`;

      if (viewingThisSession()) {
        setMessages((prev) => {
          if (
            prev.some(
              (m) =>
                m.id === optimisticId ||
                (m.role === "user" && m.content.trim() === input.content.trim()),
            )
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              id: optimisticId,
              role: "user",
              content: input.content,
              createdAt: new Date().toISOString(),
              optimistic: true,
            },
          ];
        });
      }

      const applyIfViewing = async () => {
        if (!viewingThisSession()) return null;
        return loadSessionMessages(organizationId, input.sessionId);
      };

      try {
        const response = await sendAiMessageWithReconcile(
          organizationId,
          input.sessionId,
          {
            content: input.content,
            clientRequestId: input.clientRequestId,
          },
          {
            // Free-tier providers can exceed ~2 minutes; keep waiting longer before
            // showing the “still working / retry” banner.
            maxPolls: 60,
            pollIntervalMs: 3_000,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        if (response.execution === "IN_PROGRESS") {
          // Max polls exhausted — refresh transcript; keep same pending id.
          setPending(organizationId, input);

          let userPersisted = false;
          try {
            const detail = await getAiSession(organizationId, input.sessionId);
            userPersisted = transcriptHasUserContent(
              detail.messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              input.content,
            );
            if (viewingThisSession()) {
              const mapped = detail.messages
                .map(mapApiMessage)
                .filter((m): m is AiUiMessage => m !== null);
              setMessages(mapped);
              setMessageLimitReached(
                detail.messagesTruncated === true ||
                  detail.messages.length >= AI_SESSION_MESSAGE_LIMIT,
              );
            }
          } catch {
            userPersisted = false;
          }

          if (viewingThisSession()) {
            if (!userPersisted) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === optimisticId)) return prev;
                if (
                  prev.some(
                    (m) =>
                      m.role === "user" &&
                      m.content.trim() === input.content.trim(),
                  )
                ) {
                  return prev;
                }
                return [
                  ...prev,
                  {
                    id: optimisticId,
                    role: "user",
                    content: input.content,
                    createdAt: new Date().toISOString(),
                    optimistic: true,
                  },
                ];
              });
              setBanner({
                tone: "info",
                text: "Still working on this request. Use Retry to keep waiting on the same question — that will not start a second AI task.",
              });
            } else {
              setBanner({
                tone: "info",
                text: "Still working on this request — larger lookups can take about a minute. Retry continues the same work without using another AI task.",
              });
            }
          }
          return;
        }

        if (response.execution === "FAILED") {
          setPending(organizationId, null);
          const text = aiExecutionBannerText(response);
          await applyIfViewing();
          await refreshSessions(organizationId);
          await refreshUsage(organizationId);
          if (viewingThisSession()) {
            setBanner({ tone: "error", text });
          }
          return;
        }

        if (response.execution === "INTERRUPTED") {
          setPending(organizationId, null);
          const text = aiExecutionBannerText(response);
          await applyIfViewing();
          await refreshSessions(organizationId);
          await refreshUsage(organizationId);
          if (viewingThisSession()) {
            setBanner({ tone: "warning", text });
          }
          return;
        }

        // COMPLETED
        setPending(organizationId, null);
        setDraft("");
        await applyIfViewing();
        await refreshSessions(organizationId);
        await refreshUsage(organizationId);
        await refreshProposals(organizationId);
        if (viewingThisSession()) {
          setBanner(null);
        }
      } catch (error) {
        if (isAiAbortError(error) || controller.signal.aborted) {
          // Frontend wait cancelled; backend may still be running. Keep pending.
          return;
        }

        if (error instanceof SessionExpiredError) {
          setPending(organizationId, null);
          setBanner({
            tone: "error",
            text: "Your session has expired. Please sign in again.",
          });
        } else if (isAiPlanLimitError(error)) {
          setPending(organizationId, null);
          setBanner({
            tone: "error",
            text: aiFriendlyError(error),
          });
          await refreshUsage(organizationId);
        } else if (error instanceof ApiError && error.status === 0) {
          setPending(organizationId, input);
          if (viewingThisSession()) {
            setBanner({
              tone: "warning",
              text: "We could not reach FieldKeel. Your request may still be running — use Retry if shown to continue the same request.",
            });
          }
        } else {
          const clearPending =
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 408;
          if (clearPending) {
            setPending(organizationId, null);
          } else {
            setPending(organizationId, input);
          }
          if (viewingThisSession()) {
            setBanner({
              tone: "error",
              text: aiFriendlyError(error),
            });
          }
        }

        if (viewingThisSession()) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          try {
            await loadSessionMessages(organizationId, input.sessionId);
          } catch {
            // ignore secondary load failure
          }
        }
      } finally {
        if (sendAbortRef.current === controller) {
          sendAbortRef.current = null;
        }
        if (lockOwnerRef.current === owner) {
          setSubmitting(false);
          setPendingLabel(undefined);
          releaseActionLock();
        }
      }
    },
    [
      abortFrontendWait,
      loadSessionMessages,
      organizationId,
      refreshSessions,
      refreshProposals,
      refreshUsage,
      releaseActionLock,
      setPending,
    ],
  );

  const handleSend = useCallback(
    async (overrideContent?: string) => {
      if (!organizationId || submitting || actionLock.current || creatingSession) {
        return;
      }
      if (
        usage?.enabled &&
        typeof usage.remaining === "number" &&
        usage.remaining <= 0
      ) {
        setBanner({
          tone: "error",
          text: "You've used this month's AI task allowance. New questions are blocked until next month (UTC) or a plan change. You can still read past conversations.",
        });
        return;
      }
      const content = (overrideContent ?? draft).trim();
      if (!content) return;

      // Take the shared lock before session creation to prevent duplicate sessions.
      actionLock.current = true;
      const preSendOwner = Symbol("ai-pre-send");
      lockOwnerRef.current = preSendOwner;
      setBanner(null);

      let sessionId = activeId;
      if (!sessionId) {
        setCreatingSession(true);
        try {
          const session = await createAiSession(organizationId);
          sessionId = session.id;
          await refreshSessions(organizationId);
          messagesGenRef.current += 1;
          setActiveId(session.id);
          activeIdRef.current = session.id;
          setMessages([]);
          setMessageLimitReached(false);
        } catch (error) {
          setBanner({ tone: "error", text: aiFriendlyError(error) });
          setCreatingSession(false);
          if (lockOwnerRef.current === preSendOwner) {
            releaseActionLock();
          }
          return;
        } finally {
          setCreatingSession(false);
        }
      }

      const memoryPending =
        pendingSendRef.current?.sessionId === sessionId
          ? pendingSendRef.current
          : null;
      const storedPending = readPendingAiRequest(organizationId, sessionId);
      const existing = memoryPending ?? (storedPending
        ? {
            sessionId: storedPending.sessionId,
            clientRequestId: storedPending.clientRequestId,
            content: storedPending.content,
            createdAt: storedPending.createdAt,
          }
        : null);

      if (existing && existing.content !== content) {
        setPendingSend(existing);
        pendingSendRef.current = existing;
        setBanner({
          tone: "warning",
          text: "A request is still pending in this conversation. Use Retry to continue it, or Discard before sending a different message. Retry continues the same request.",
        });
        if (lockOwnerRef.current === preSendOwner) {
          releaseActionLock();
        }
        return;
      }

      const clientRequestId = existing
        ? existing.clientRequestId
        : newAiClientRequestId();

      const pending: PendingSend = {
        sessionId,
        clientRequestId,
        content: existing?.content ?? content,
        createdAt: existing?.createdAt ?? Date.now(),
      };

      setDraft("");
      await runSend(pending, { alreadyLocked: true });
    },
    [
      activeId,
      creatingSession,
      draft,
      organizationId,
      refreshSessions,
      releaseActionLock,
      runSend,
      submitting,
      usage?.enabled,
      usage?.remaining,
    ],
  );

  const handlePickPrompt = useCallback(
    (prompt: string) => {
      void handleSend(prompt);
    },
    [handleSend],
  );

  const handleRetryPending = useCallback(async () => {
    const pending = pendingSendRef.current;
    if (!pending || submitting || actionLock.current) return;
    if (activeIdRef.current !== pending.sessionId) {
      setActiveId(pending.sessionId);
      activeIdRef.current = pending.sessionId;
      if (organizationId) {
        await loadSessionMessages(organizationId, pending.sessionId);
      }
    }
    await runSend(pending);
  }, [loadSessionMessages, organizationId, runSend, submitting]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [activeId, sessions],
  );

  const pendingForActive =
    pendingSend && activeId && pendingSend.sessionId === activeId
      ? pendingSend
      : null;

  const showWelcome =
    Boolean(activeId) &&
    !messagesLoading &&
    messages.length === 0 &&
    !submitting &&
    !pendingForActive;

  if (bootLoading) {
    return (
      <div className="mx-auto w-full max-w-[1500px] flex-1 rounded-xl border border-border bg-card p-6">
        <SkeletonBlock rows={8} />
      </div>
    );
  }

  if (bootError || !organizationId) {
    return (
      <div className="mx-auto w-full max-w-[1500px] flex-1 rounded-xl border border-border bg-card p-6">
        <ErrorState
          title="Could not open AI Workforce"
          description={bootError ?? "Organization context is unavailable."}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-[28rem] w-full max-w-[1500px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-workspace shadow-raise">
      <AiChatHeader
        onToggleSidebar={() => setMobileSidebarOpen((open) => !open)}
        sidebarOpen={mobileSidebarOpen}
        usage={usage}
        usageLoading={usageLoading}
        usageUnavailable={usageUnavailable}
        canReviewProposals={canReviewProposals}
        pendingProposalCount={reviewProposals.length}
        proposalsLoading={proposalsLoading}
        proposalsOpen={proposalsOpen}
        onToggleProposals={() => setProposalsOpen((open) => !open)}
      />

      {proposalsOpen && canReviewProposals ? (
        <AiProposalsInboxPanel
          items={reviewProposals}
          details={proposalDetails}
          loading={proposalsLoading}
          onRefresh={() => {
            if (organizationId) void refreshProposals(organizationId);
          }}
          onLoadDetail={loadProposalDetail}
          onDecide={handleDecideProposal}
          onClose={() => setProposalsOpen(false)}
        />
      ) : null}

      {banner ? (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-2 border-b px-4 py-2.5 text-sm md:px-5",
            banner.tone === "error" &&
              "border-destructive/30 bg-destructive/10 text-destructive",
            banner.tone === "warning" &&
              "border-amber/40 bg-amber/10 text-foreground",
            banner.tone === "info" && "border-border bg-muted text-foreground",
          )}
          role="status"
        >
          <p className="min-w-0 flex-1">{banner.text}</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            {pendingForActive ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => void handleRetryPending()}
                >
                  Retry same request
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={submitting}
                  onClick={handleAbandonPending}
                >
                  Discard retry
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (pendingForActive && !submitting) {
                  handleAbandonPending();
                } else {
                  setBanner(null);
                }
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <div className="hidden w-72 shrink-0 border-r border-border lg:block">
          <AiConversationSidebar
            conversations={sessions}
            activeId={activeId}
            onSelect={(id) => void handleSelect(id)}
            onNewChat={() => void handleNewChat()}
            onRename={handleRenameSession}
            onDelete={handleDeleteSession}
            isSessionBusy={isSessionBusy}
            loading={sessionsLoading && sessions.length === 0}
            creating={creatingSession || submitting}
            listLimit={AI_SESSION_LIST_LIMIT}
          />
        </div>

        {mobileSidebarOpen ? (
          <div className="absolute inset-0 z-20 flex lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-foreground/20"
              aria-label="Close conversations"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative z-10 h-full w-[min(100%,18rem)] border-r border-border shadow-float">
              <AiConversationSidebar
                conversations={sessions}
                activeId={activeId}
                onSelect={(id) => void handleSelect(id)}
                onNewChat={() => void handleNewChat()}
                onRename={handleRenameSession}
                onDelete={handleDeleteSession}
                isSessionBusy={isSessionBusy}
                loading={sessionsLoading && sessions.length === 0}
                creating={creatingSession || submitting}
                listLimit={AI_SESSION_LIST_LIMIT}
              />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col bg-workspace">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 md:px-5">
            {!activeId ? (
              <div className="mx-auto flex max-w-xl flex-col gap-3 px-1 py-10">
                <h2 className="text-lg font-semibold text-foreground">
                  Start a conversation
                </h2>
                <p className="text-sm text-muted-foreground">
                  Create a new chat or open one from the sidebar
                  {sessions.length === 0 ? " once you have history" : ""}.
                </p>
                {pendingSend ? (
                  <p className="text-sm text-muted-foreground">
                    You have a pending AI request in another conversation. Open
                    that chat to retry the same request.
                  </p>
                ) : null}
                <Button
                  type="button"
                  className="w-fit"
                  disabled={creatingSession || submitting}
                  onClick={() => void handleNewChat()}
                >
                  New chat
                </Button>
              </div>
            ) : messagesLoading ? (
              <div className="mx-auto max-w-3xl py-6">
                <SkeletonBlock rows={6} />
              </div>
            ) : showWelcome ? (
              <AiWelcomeScreen
                onPickPrompt={handlePickPrompt}
                disabled={
                  submitting ||
                  creatingSession ||
                  !organizationId ||
                  (Boolean(usage?.enabled) &&
                    typeof usage?.remaining === "number" &&
                    usage.remaining <= 0)
                }
              />
            ) : (
              <AiMessageList
                messages={messages}
                submitting={submitting && Boolean(pendingForActive)}
                pendingLabel={pendingLabel}
                messageLimitReached={messageLimitReached}
                messageLimit={AI_SESSION_MESSAGE_LIMIT}
                onPickFollowUp={handlePickPrompt}
                followUpsDisabled={
                  submitting ||
                  creatingSession ||
                  (Boolean(usage?.enabled) &&
                    typeof usage?.remaining === "number" &&
                    usage.remaining <= 0)
                }
                sessionProposals={sessionProposalDetails}
                onDecideProposal={handleDecideProposal}
              />
            )}
          </div>
          {pendingForActive && !banner && !submitting ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/50 px-3 py-2 text-xs text-foreground md:px-4">
              <p className="min-w-0 flex-1">
                A previous request may still be finishing. Retry continues the
                same work without starting a new AI task.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRetryPending()}
                >
                  Retry same request
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleAbandonPending}
                >
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
          <AiMessageComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void handleSend()}
            onPickPrompt={handlePickPrompt}
            showPromptChips={
              Boolean(activeId) && !showWelcome && !messagesLoading
            }
            submitting={submitting || creatingSession}
            disabled={!organizationId}
            limitReached={
              Boolean(usage?.enabled) &&
              typeof usage?.remaining === "number" &&
              usage.remaining <= 0
            }
          />
          {activeSession?.title ? (
            <p className="sr-only">Active conversation: {activeSession.title}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
