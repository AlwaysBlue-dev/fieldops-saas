import { sanitizeSchemaForGemini } from './gemini-ai.provider.js';

describe('sanitizeSchemaForGemini', () => {
  it('strips additionalProperties while preserving core fields', () => {
    const sanitized = sanitizeSchemaForGemini({
      type: 'object',
      additionalProperties: false,
      required: ['page'],
      properties: {
        page: {
          type: 'number',
          minimum: 1,
          additionalProperties: false,
        },
        status: {
          type: 'string',
          enum: ['OPEN', 'COMPLETED'],
        },
      },
    });

    expect(sanitized).toEqual({
      type: 'object',
      required: ['page'],
      properties: {
        page: {
          type: 'number',
          minimum: 1,
        },
        status: {
          type: 'string',
          enum: ['OPEN', 'COMPLETED'],
        },
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain('additionalProperties');
  });

  it('drops unsupported JSON Schema keywords', () => {
    const sanitized = sanitizeSchemaForGemini({
      type: 'object',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      unevaluatedProperties: false,
      patternProperties: { '^x-': { type: 'string' } },
      properties: {
        q: { type: 'string', minLength: 1 },
      },
    });

    expect(sanitized).toEqual({
      type: 'object',
      properties: {
        q: { type: 'string', minLength: 1 },
      },
    });
  });
});
