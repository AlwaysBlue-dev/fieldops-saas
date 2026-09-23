import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BILLING_POLICY_VERSION,
  DEFAULT_SALES_EMAIL,
  DEFAULT_SECURITY_EMAIL,
  DEFAULT_SUPPORT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '../common/constants.js';
import type { EnvironmentVariables } from '../config/env.js';

@Injectable()
export class LegalService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  publicTrust() {
    return {
      productName: 'FieldOps Cloud',
      supportEmail: this.supportEmail(),
      salesEmail: this.salesEmail(),
      securityEmail: this.securityEmail(),
      legalEntityName: this.optional('LEGAL_ENTITY_NAME'),
      governingLaw: this.optional('LEGAL_GOVERNING_LAW'),
      hostingRegionConfigured: false,
      terms: {
        version: this.config.get('TERMS_VERSION', { infer: true }) ?? TERMS_VERSION,
        effectiveDate:
          this.config.get('LEGAL_EFFECTIVE_DATE', { infer: true }) ?? LEGAL_EFFECTIVE_DATE,
      },
      privacy: {
        version: this.config.get('PRIVACY_VERSION', { infer: true }) ?? PRIVACY_VERSION,
        effectiveDate:
          this.config.get('LEGAL_EFFECTIVE_DATE', { infer: true }) ?? LEGAL_EFFECTIVE_DATE,
      },
      billingPolicy: {
        version:
          this.config.get('BILLING_POLICY_VERSION', { infer: true }) ??
          BILLING_POLICY_VERSION,
        effectiveDate:
          this.config.get('LEGAL_EFFECTIVE_DATE', { infer: true }) ?? LEGAL_EFFECTIVE_DATE,
      },
    };
  }

  supportEmail() {
    return (
      this.config.get('PLATFORM_SUPPORT_EMAIL', { infer: true }) ?? DEFAULT_SUPPORT_EMAIL
    );
  }

  salesEmail() {
    return this.config.get('PLATFORM_SALES_EMAIL', { infer: true }) ?? DEFAULT_SALES_EMAIL;
  }

  securityEmail() {
    return (
      this.config.get('SECURITY_CONTACT_EMAIL', { infer: true }) ?? DEFAULT_SECURITY_EMAIL
    );
  }

  termsVersion() {
    return this.config.get('TERMS_VERSION', { infer: true }) ?? TERMS_VERSION;
  }

  privacyVersion() {
    return this.config.get('PRIVACY_VERSION', { infer: true }) ?? PRIVACY_VERSION;
  }

  private optional(key: 'LEGAL_ENTITY_NAME' | 'LEGAL_GOVERNING_LAW') {
    const value = this.config.get(key, { infer: true });
    return value && value.trim() ? value.trim() : null;
  }
}
