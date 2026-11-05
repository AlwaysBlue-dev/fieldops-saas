import { Injectable } from '@nestjs/common';
import type { AiToolDefinition } from '../providers/ai-provider.types.js';
import type { AiRegisteredTool, AiToolAccess } from './ai-tool.types.js';

const ALLOWED_ACCESS: ReadonlySet<AiToolAccess> = new Set(['read', 'propose']);

/**
 * In-process registry of NestJS-approved AI tools.
 * Read and propose tools register on module init; AiService attaches
 * `listDefinitions()` to provider requests during orchestration.
 */
@Injectable()
export class AiToolRegistry {
  private readonly tools = new Map<string, AiRegisteredTool>();

  /**
   * Register an approved tool. Duplicate names throw.
   * Only `access: 'read' | 'propose'` is accepted.
   */
  register(tool: AiRegisteredTool): void {
    const name = tool.definition.name?.trim();
    if (!name) {
      throw new Error('AI tool registration requires a non-empty definition.name.');
    }
    if (tool.definition.name !== name) {
      throw new Error(
        `AI tool name must be trimmed; received "${tool.definition.name}".`,
      );
    }
    if (!this.isAllowedAccess(tool.access)) {
      throw new Error(
        `AI tool "${name}" rejected: only access "read" or "propose" may be registered.`,
      );
    }
    if (this.tools.has(name)) {
      throw new Error(`AI tool "${name}" is already registered.`);
    }
    if (typeof tool.handler !== 'function') {
      throw new Error(`AI tool "${name}" requires a handler function.`);
    }
    this.tools.set(name, {
      ...tool,
      definition: {
        name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      },
      access: tool.access,
      enabled: tool.enabled !== false,
    });
  }

  /** Exact-name lookup; unknown names return null. */
  get(name: string): AiRegisteredTool | null {
    const key = name?.trim();
    if (!key) return null;
    return this.tools.get(key) ?? null;
  }

  has(name: string): boolean {
    return this.get(name) != null;
  }

  /** Definitions for enabled tools only — safe to attach to provider requests. */
  listDefinitions(options?: { includeDisabled?: boolean }): AiToolDefinition[] {
    const includeDisabled = options?.includeDisabled === true;
    const defs: AiToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (!includeDisabled && !tool.enabled) continue;
      defs.push({
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      });
    }
    return defs.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Registered tool names (for diagnostics). */
  listNames(options?: { includeDisabled?: boolean }): string[] {
    return this.listDefinitions(options).map((d) => d.name);
  }

  size(): number {
    return this.tools.size;
  }

  private isAllowedAccess(access: AiToolAccess | string): access is AiToolAccess {
    return ALLOWED_ACCESS.has(access as AiToolAccess);
  }
}
