import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { SubscriptionModule } from '../subscription/subscription.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiProposalService } from './proposals/ai-proposal.service.js';
import {
  AI_PROVIDER,
  AI_PROVIDER_ROUTER,
} from './providers/ai-provider.interface.js';
import { AiProviderRouter } from './providers/ai-provider.router.js';
import { GeminiAiProvider } from './providers/gemini-ai.provider.js';
import { GroqAiProvider } from './providers/groq-ai.provider.js';
import { OpenRouterAiProvider } from './providers/openrouter-ai.provider.js';
import { StubAiProvider } from './providers/stub-ai.provider.js';
import { FindMissingAccessAiTool } from './tools/handlers/find-missing-access.tool.js';
import { GetJobsAiTool } from './tools/handlers/get-jobs.tool.js';
import { GetScheduleAiTool } from './tools/handlers/get-schedule.tool.js';
import { AiToolExecutorService } from './tools/ai-tool-executor.service.js';
import { AiToolRegistry } from './tools/ai-tool.registry.js';
import { AiUsageService } from './usage/ai-usage.service.js';

@Module({
  imports: [SubscriptionModule, OrganizationsModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiUsageService,
    AiProposalService,
    AiToolRegistry,
    AiToolExecutorService,
    GetJobsAiTool,
    FindMissingAccessAiTool,
    GetScheduleAiTool,
    GroqAiProvider,
    GeminiAiProvider,
    OpenRouterAiProvider,
    StubAiProvider,
    AiProviderRouter,
    {
      provide: AI_PROVIDER_ROUTER,
      useExisting: AiProviderRouter,
    },
    {
      // Backward-compatible “primary” token = first configured chain member or Groq.
      provide: AI_PROVIDER,
      inject: [AiProviderRouter, GroqAiProvider],
      useFactory: (router: AiProviderRouter, groq: GroqAiProvider) =>
        router.primaryProvider() ?? groq,
    },
  ],
  exports: [
    AiService,
    AiUsageService,
    AiProposalService,
    AiToolRegistry,
    AiToolExecutorService,
    AI_PROVIDER,
    AI_PROVIDER_ROUTER,
  ],
})
export class AiModule {}
