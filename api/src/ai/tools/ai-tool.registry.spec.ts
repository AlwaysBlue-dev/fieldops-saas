import { AiToolRegistry } from './ai-tool.registry.js';
import type { AiRegisteredTool } from './ai-tool.types.js';

function sampleTool(
  overrides: Partial<AiRegisteredTool> & {
    access?: string;
  } = {},
): AiRegisteredTool {
  return {
    access: 'read',
    enabled: true,
    definition: {
      name: 'getJobs',
      description: 'List jobs',
      parameters: { type: 'object', properties: {} },
    },
    handler: async () => ({ ok: true }),
    ...overrides,
    // keep definition merge shallow
    ...(overrides.definition
      ? {
          definition: {
            name: 'getJobs',
            description: 'List jobs',
            parameters: { type: 'object', properties: {} },
            ...overrides.definition,
          },
        }
      : {}),
  } as AiRegisteredTool;
}

describe('AiToolRegistry read-only enforcement', () => {
  it('registers read tools and lists their definitions', () => {
    const registry = new AiToolRegistry();
    registry.register(sampleTool());
    expect(registry.listNames()).toEqual(['getJobs']);
    expect(registry.get('getJobs')?.access).toBe('read');
  });

  it('rejects unknown access at registration', () => {
    const registry = new AiToolRegistry();
    expect(() =>
      registry.register(
        sampleTool({
          access: 'write' as 'read',
          definition: {
            name: 'createJob',
            description: 'forbidden',
            parameters: { type: 'object', properties: {} },
          },
        }),
      ),
    ).toThrow(/only access "read" or "propose"/);
    expect(registry.size()).toBe(0);
  });

  it('registers propose tools', () => {
    const registry = new AiToolRegistry();
    registry.register(
      sampleTool({
        access: 'propose',
        definition: {
          name: 'proposeAction',
          description: 'Propose a mutation',
          parameters: { type: 'object', properties: {} },
        },
      }),
    );
    expect(registry.get('proposeAction')?.access).toBe('propose');
  });

  it('rejects duplicate tool names', () => {
    const registry = new AiToolRegistry();
    registry.register(sampleTool());
    expect(() => registry.register(sampleTool())).toThrow(/already registered/);
  });
});
