import type { AiJsonObject, AiJsonValue } from '../providers/ai-provider.types.js';

/**
 * Conservative JSON Schema subset validator for AI tool parameters.
 * No AJV/Zod in the API dependencies — validate application-owned schemas here.
 *
 * Supported keywords (object-focused):
 * - type (string | number | integer | boolean | null | object | array)
 * - properties, required, additionalProperties (boolean; default false for objects)
 * - items (single schema), minItems / maxItems
 * - enum, minLength / maxLength, minimum / maximum
 *
 * Unsupported / ignored advanced keywords are not evaluated as “valid by default”
 * for unknown property shapes when additionalProperties is false.
 */

export type AiToolSchemaValidationFailure = {
  path: string;
  message: string;
};

export type AiToolSchemaValidationResult =
  | { ok: true; value: AiJsonObject }
  | { ok: false; failures: AiToolSchemaValidationFailure[] };

function isPlainObject(value: unknown): value is AiJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pathJoin(base: string, key: string): string {
  if (!base) return key;
  if (key.startsWith('[')) return `${base}${key}`;
  return `${base}.${key}`;
}

function asSchemaObject(schema: unknown): AiJsonObject | null {
  return isPlainObject(schema) ? schema : null;
}

function schemaType(schema: AiJsonObject): string | string[] | null {
  const t = schema.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t) && t.every((x) => typeof x === 'string')) {
    return t as string[];
  }
  return null;
}

function typeMatches(expected: string, value: unknown): boolean {
  switch (expected) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function validateValue(
  schema: AiJsonObject,
  value: unknown,
  path: string,
  failures: AiToolSchemaValidationFailure[],
): void {
  const expected = schemaType(schema);
  if (expected != null) {
    const types = Array.isArray(expected) ? expected : [expected];
    if (!types.some((t) => typeMatches(t, value))) {
      failures.push({
        path: path || '(root)',
        message: `Expected type ${types.join(' | ')}.`,
      });
      return;
    }
  }

  if (schema.enum != null) {
    if (!Array.isArray(schema.enum)) {
      failures.push({
        path: path || '(root)',
        message: 'Schema enum must be an array.',
      });
      return;
    }
    const allowed = schema.enum as AiJsonValue[];
    const match = allowed.some(
      (item) => JSON.stringify(item) === JSON.stringify(value),
    );
    if (!match) {
      failures.push({
        path: path || '(root)',
        message: 'Value is not an allowed enum member.',
      });
      return;
    }
  }

  if (typeof value === 'string') {
    if (
      typeof schema.minLength === 'number' &&
      value.length < schema.minLength
    ) {
      failures.push({
        path: path || '(root)',
        message: `String shorter than minLength ${schema.minLength}.`,
      });
    }
    if (
      typeof schema.maxLength === 'number' &&
      value.length > schema.maxLength
    ) {
      failures.push({
        path: path || '(root)',
        message: `String longer than maxLength ${schema.maxLength}.`,
      });
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      failures.push({
        path: path || '(root)',
        message: `Number below minimum ${schema.minimum}.`,
      });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      failures.push({
        path: path || '(root)',
        message: `Number above maximum ${schema.maximum}.`,
      });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      failures.push({
        path: path || '(root)',
        message: `Array shorter than minItems ${schema.minItems}.`,
      });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      failures.push({
        path: path || '(root)',
        message: `Array longer than maxItems ${schema.maxItems}.`,
      });
    }
    const itemSchema = asSchemaObject(schema.items);
    if (itemSchema) {
      value.forEach((item, index) => {
        validateValue(itemSchema, item, pathJoin(path, `[${index}]`), failures);
      });
    }
    return;
  }

  if (isPlainObject(value)) {
    const properties = asSchemaObject(schema.properties) ?? {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((k): k is string => typeof k === 'string')
      : [];

    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        failures.push({
          path: pathJoin(path, key),
          message: 'Required property is missing.',
        });
      }
    }

    // Strict by default: unknown keys rejected unless additionalProperties === true.
    const additional = schema.additionalProperties;
    const allowAdditional = additional === true;
    const additionalSchema =
      additional !== false && additional !== true && isPlainObject(additional)
        ? additional
        : null;

    for (const key of Object.keys(value)) {
      const propSchema = asSchemaObject(properties[key]);
      if (propSchema) {
        validateValue(propSchema, value[key], pathJoin(path, key), failures);
        continue;
      }
      if (allowAdditional) {
        continue;
      }
      if (additionalSchema) {
        validateValue(additionalSchema, value[key], pathJoin(path, key), failures);
        continue;
      }
      failures.push({
        path: pathJoin(path, key),
        message: 'Unknown property is not allowed.',
      });
    }
  }
}

/**
 * Validate untrusted tool arguments against a root JSON Schema object.
 * Root value must be a plain object (never array/primitive/null).
 */
export function validateToolArguments(
  schema: AiJsonObject,
  args: unknown,
): AiToolSchemaValidationResult {
  if (!isPlainObject(args)) {
    return {
      ok: false,
      failures: [
        {
          path: '(root)',
          message: 'Tool arguments must be a JSON object.',
        },
      ],
    };
  }

  const rootType = schemaType(schema);
  if (rootType != null) {
    const types = Array.isArray(rootType) ? rootType : [rootType];
    if (!types.includes('object')) {
      return {
        ok: false,
        failures: [
          {
            path: '(root)',
            message: 'Tool parameter schema root must allow type object.',
          },
        ],
      };
    }
  }

  const failures: AiToolSchemaValidationFailure[] = [];
  validateValue(schema, args, '', failures);
  if (failures.length) {
    return { ok: false, failures };
  }
  return { ok: true, value: args };
}

export function formatSchemaFailures(
  failures: AiToolSchemaValidationFailure[],
): string {
  const preview = failures
    .slice(0, 5)
    .map((f) => `${f.path}: ${f.message}`)
    .join('; ');
  if (failures.length <= 5) return preview;
  return `${preview}; …and ${failures.length - 5} more`;
}
