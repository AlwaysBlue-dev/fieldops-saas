import {
  collectUsageEventIdsFromMessages,
  compareChatMessageOrder,
  mapStoredMessagesToProviderInput,
  shouldIncludeMessageInModelHistory,
  type AiStoredChatMessageRow,
} from './ai-message-history.js';

/** Role literals — avoid depending on Prisma Client regeneration for unit specs. */
const ROLE = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  TOOL: 'TOOL',
} as unknown as {
  USER: AiStoredChatMessageRow['role'];
  ASSISTANT: AiStoredChatMessageRow['role'];
  TOOL: AiStoredChatMessageRow['role'];
};

describe('AI message history — unsuccessful turn exclusion', () => {
  it('excludes FAILED and INTERRUPTED; keeps SUCCEEDED, SKIPPED, and PENDING', () => {
    const usageStatusById = new Map([
      ['u-failed', 'FAILED'],
      ['u-interrupted', 'INTERRUPTED'],
      ['u-skipped', 'SKIPPED'],
      ['u-ok', 'SUCCEEDED'],
      ['u-pending', 'PENDING'],
    ]);

    expect(
      shouldIncludeMessageInModelHistory({
        metadata: { usageEventId: 'u-failed' },
        usageStatusById,
      }),
    ).toBe(false);
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: { usageEventId: 'u-interrupted' },
        usageStatusById,
      }),
    ).toBe(false);
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: { usageEventId: 'u-skipped' },
        usageStatusById,
      }),
    ).toBe(true);
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: { usageEventId: 'u-ok' },
        usageStatusById,
      }),
    ).toBe(true);
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: { usageEventId: 'u-pending' },
        usageStatusById,
      }),
    ).toBe(true);
  });

  it('fails closed when usageEventId is missing from the status map', () => {
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: { usageEventId: 'missing-event' },
        usageStatusById: new Map(),
      }),
    ).toBe(false);
  });

  it('keeps legacy untagged messages eligible', () => {
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: { kind: 'legacy' },
        usageStatusById: new Map(),
      }),
    ).toBe(true);
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: null,
        usageStatusById: new Map(),
      }),
    ).toBe(true);
  });

  it('does not trust excludeFromModelHistory when usage status is SUCCEEDED', () => {
    expect(
      shouldIncludeMessageInModelHistory({
        metadata: {
          usageEventId: 'u-ok',
          excludeFromModelHistory: true,
        },
        usageStatusById: new Map([['u-ok', 'SUCCEEDED']]),
      }),
    ).toBe(true);
  });

  it('collects distinct usageEventIds for batched lookup', () => {
    const ids = collectUsageEventIdsFromMessages([
      { metadata: { usageEventId: 'a' } },
      { metadata: { usageEventId: 'a' } },
      { metadata: { usageEventId: 'b' } },
      { metadata: null },
    ]);
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});

describe('AI message history — tool-call/result ordering', () => {
  it('emits assistant toolCalls then TOOL results in call order', () => {
    const mapped = mapStoredMessagesToProviderInput([
      {
        role: ROLE.USER,
        content: 'Where are my jobs?',
      },
      {
        role: ROLE.ASSISTANT,
        content: '',
        toolCalls: [
          { id: 'c1', name: 'getJobs', arguments: { page: 1 } },
          { id: 'c2', name: 'getSchedule', arguments: {} },
        ],
      },
      {
        role: ROLE.TOOL,
        content: '{"ok":true}',
        toolCallId: 'c1',
        toolName: 'getJobs',
      },
      {
        role: ROLE.TOOL,
        content: '{"ok":true,"data":[]}',
        toolCallId: 'c2',
        toolName: 'getSchedule',
      },
      {
        role: ROLE.ASSISTANT,
        content: 'Here is a summary.',
      },
    ]);

    expect(mapped).toEqual([
      { role: 'user', content: 'Where are my jobs?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'c1', name: 'getJobs', arguments: { page: 1 } },
          { id: 'c2', name: 'getSchedule', arguments: {} },
        ],
      },
      {
        role: 'tool',
        content: '{"ok":true}',
        toolCallId: 'c1',
        name: 'getJobs',
      },
      {
        role: 'tool',
        content: '{"ok":true,"data":[]}',
        toolCallId: 'c2',
        name: 'getSchedule',
      },
      { role: 'assistant', content: 'Here is a summary.' },
    ]);
  });

  it('skips incomplete tool groups without discarding later messages', () => {
    const diagnostics: Array<{ expectedCalls: number; foundResults: number }> =
      [];
    const mapped = mapStoredMessagesToProviderInput(
      [
        {
          role: ROLE.ASSISTANT,
          content: '',
          toolCalls: [{ id: 'c1', name: 'getJobs', arguments: {} }],
        },
        // Missing TOOL row — incomplete mid-history group.
        {
          role: ROLE.USER,
          content: 'What about tomorrow?',
        },
        {
          role: ROLE.ASSISTANT,
          content: 'Tomorrow looks clear.',
        },
      ],
      {
        onIncompleteToolGroup: (info) => {
          diagnostics.push({
            expectedCalls: info.expectedCalls,
            foundResults: info.foundResults,
          });
        },
      },
    );
    expect(diagnostics).toEqual([{ expectedCalls: 1, foundResults: 0 }]);
    expect(mapped).toEqual([
      { role: 'user', content: 'What about tomorrow?' },
      { role: 'assistant', content: 'Tomorrow looks clear.' },
    ]);
  });
});

describe('compareChatMessageOrder', () => {
  it('orders by historySequence when createdAt ties', () => {
    const t = new Date('2026-01-01T00:00:00.000Z');
    const assistant = {
      id: 'z',
      createdAt: t,
      metadata: { historySequence: 1000 },
    };
    const tool = {
      id: 'a',
      createdAt: t,
      metadata: { historySequence: 1001 },
    };
    expect(compareChatMessageOrder(assistant, tool)).toBeLessThan(0);
    expect(compareChatMessageOrder(tool, assistant)).toBeGreaterThan(0);
  });
});
