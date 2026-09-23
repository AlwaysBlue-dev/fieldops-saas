import { Controller, Get } from '@nestjs/common';
import { LegalService } from './legal.service.js';

@Controller('trust')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  get() {
    return this.legal.publicTrust();
  }
}
