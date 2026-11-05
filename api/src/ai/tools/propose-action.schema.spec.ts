import { describe, expect, it } from 'vitest';
import { PROPOSE_ACTION_TOOL_DEFINITION } from './handlers/propose-action.tool.js';
import { validateToolArguments } from './ai-tool-schema.validator.js';

describe('proposeAction parameter schema', () => {
  it('accepts client.create payload with name', () => {
    const result = validateToolArguments(
      PROPOSE_ACTION_TOOL_DEFINITION.parameters,
      {
        actionType: 'client.create',
        payload: { name: 'Emily' },
        rationale: 'New customer from chat',
      },
    );
    expect(result.ok).toBe(true);
  });

  it('accepts optional contact fields on client.create', () => {
    const result = validateToolArguments(
      PROPOSE_ACTION_TOOL_DEFINITION.parameters,
      {
        actionType: 'client.create',
        payload: {
          name: 'Emily',
          primaryContactEmail: 'emily@example.com',
          notes: 'VIP',
        },
      },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    const result = validateToolArguments(
      PROPOSE_ACTION_TOOL_DEFINITION.parameters,
      {
        actionType: 'client.create',
        payload: { name: 'Emily' },
        name: 'Emily',
      },
    );
    expect(result.ok).toBe(false);
  });
});
