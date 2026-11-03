import {
  validateProviderToolCallList,
  validateToolRoundForPersistence,
} from './ai-tool-round.validation.js';

describe('validateProviderToolCallList', () => {
  it('rejects duplicate tool-call ids in a round', () => {
    const result = validateProviderToolCallList([
      { id: 'same', name: 'getJobs', arguments: {} },
      { id: 'same', name: 'getSchedule', arguments: {} },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DUPLICATE_ID');
    }
  });

  it('accepts unique ids with plain-object arguments', () => {
    const result = validateProviderToolCallList([
      { id: 'a', name: 'getJobs', arguments: { page: 1 } },
      { id: 'b', name: 'getSchedule', arguments: {} },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.calls.map((c) => c.id)).toEqual(['a', 'b']);
    }
  });
});

describe('validateToolRoundForPersistence', () => {
  it('requires results in the same order as tool calls', () => {
    const result = validateToolRoundForPersistence({
      roundNumber: 1,
      toolCalls: [
        { id: 'a', name: 'getJobs', arguments: {} },
        { id: 'b', name: 'getSchedule', arguments: {} },
      ],
      toolResults: [
        {
          toolCallId: 'b',
          toolName: 'getSchedule',
          content: '{}',
          roundNumber: 1,
        },
        {
          toolCallId: 'a',
          toolName: 'getJobs',
          content: '{}',
          roundNumber: 1,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ORDER_MISMATCH');
    }
  });

  it('accepts 1:1 ordered results for the round', () => {
    const result = validateToolRoundForPersistence({
      roundNumber: 2,
      toolCalls: [{ id: 'a', name: 'getJobs', arguments: {} }],
      toolResults: [
        {
          toolCallId: 'a',
          toolName: 'getJobs',
          content: '{"ok":true}',
          roundNumber: 2,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
