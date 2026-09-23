import { Global, Module } from '@nestjs/common';
import { LegalController } from './legal.controller.js';
import { LegalService } from './legal.service.js';

@Global()
@Module({
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
