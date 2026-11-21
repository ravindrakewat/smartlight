import { NodeEnvironment } from '@smart-light/shared';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Outgoing SMS. India requires DLT-registered sender IDs and templates, so the
 * production provider (e.g. MSG91) is added once the municipality's DLT
 * registration is done — only this file changes.
 */
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

/** Messages "sent" in tests, so tests can read OTP codes. */
export const testOutbox: { phone: string; message: string }[] = [];

class ConsoleSmsProvider implements SmsProvider {
  async send(phone: string, message: string): Promise<void> {
    if (env.NODE_ENV === NodeEnvironment.Test) {
      testOutbox.push({ phone, message });
      return;
    }
    if (env.NODE_ENV === NodeEnvironment.Production) {
      // Never write message bodies (they contain OTPs) to production logs.
      logger.warn('SMS provider not configured; message not delivered', {
        phoneSuffix: phone.slice(-2),
      });
      return;
    }
    logger.info('SMS (development console)', { phone, message });
  }
}

export const sms: SmsProvider = new ConsoleSmsProvider();

/** Fire-and-forget notification: an SMS failure must never fail the business action. */
export function sendSmsInBackground(phone: string, message: string): void {
  sms.send(phone, message).catch((error: unknown) => {
    logger.error('SMS delivery failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });
}
