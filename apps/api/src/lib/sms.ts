import { NodeEnvironment } from '@smart-light/shared';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Outgoing SMS.
 *
 * India's TRAI DLT rules only allow pre-registered templates from a registered
 * sender ID, so callers never send free text: they pick a template and pass its
 * variables. Each template is registered on DLT and in MSG91 (Flow) with the
 * variables below as ##var1##, ##var2##… in order.
 */
export type SmsTemplate =
  /** var1 = 6-digit code. Hindi + English text, valid for 5 minutes. */
  | { template: 'otp'; code: string }
  /** var1 = complaint number, e.g. IND-C-000123. */
  | { template: 'complaint_resolved'; complaintNumber: string };

export interface SmsProvider {
  send(phone: string, sms: SmsTemplate): Promise<void>;
}

/** Text used for development logs and tests (production text lives in DLT/MSG91). */
export function renderSms(sms: SmsTemplate): string {
  switch (sms.template) {
    case 'otp':
      return `${sms.code} is your Smart Street Light verification code. Valid for 5 minutes. Do not share it.`;
    case 'complaint_resolved':
      return `आपकी शिकायत ${sms.complaintNumber} का समाधान हो गया है। Your street light complaint ${sms.complaintNumber} has been resolved. - Smart Street Light`;
  }
}

function templateVariables(sms: SmsTemplate): string[] {
  switch (sms.template) {
    case 'otp':
      return [sms.code];
    case 'complaint_resolved':
      return [sms.complaintNumber];
  }
}

/** Messages "sent" in tests, so tests can read OTP codes. */
export const testOutbox: { phone: string; message: string; sms: SmsTemplate }[] = [];

class ConsoleSmsProvider implements SmsProvider {
  async send(phone: string, sms: SmsTemplate): Promise<void> {
    if (env.NODE_ENV === NodeEnvironment.Test) {
      testOutbox.push({ phone, message: renderSms(sms), sms });
      return;
    }
    if (env.NODE_ENV === NodeEnvironment.Production) {
      // Never write message bodies (they contain OTPs) to production logs.
      logger.warn('SMS provider not configured; message not delivered', {
        template: sms.template,
        phoneSuffix: phone.slice(-2),
      });
      return;
    }
    logger.info('SMS (development console)', { phone, message: renderSms(sms) });
  }
}

export interface Msg91Config {
  authKey: string;
  templateIds: Record<SmsTemplate['template'], string>;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * MSG91 Flow API (POST /api/v5/flow). The Flow template in MSG91 is linked to
 * the DLT template ID and sender ID, so only the template ID and variables are
 * sent. MSG91 answers HTTP 200 with `type: "error"` for some failures, so the
 * body is always checked.
 */
export class Msg91SmsProvider implements SmsProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: Msg91Config) {
    this.baseUrl = config.baseUrl ?? 'https://control.msg91.com';
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async send(phone: string, sms: SmsTemplate): Promise<void> {
    // Stored as +91XXXXXXXXXX; MSG91 wants 91XXXXXXXXXX.
    const mobiles = phone.replace(/^\+/, '');
    const recipient: Record<string, string> = { mobiles };
    templateVariables(sms).forEach((value, index) => {
      recipient[`var${index + 1}`] = value;
    });

    const response = await this.fetchImpl(`${this.baseUrl}/api/v5/flow`, {
      method: 'POST',
      headers: {
        authkey: this.config.authKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        template_id: this.config.templateIds[sms.template],
        short_url: '0',
        recipients: [recipient],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const body = (await response.json().catch(() => null)) as {
      type?: string;
      message?: string;
    } | null;
    if (!response.ok || body?.type !== 'success') {
      // MSG91 error messages never contain the OTP, so they are safe to log.
      throw new Error(
        `MSG91 rejected ${sms.template} SMS (HTTP ${response.status}): ${body?.message ?? 'no body'}`,
      );
    }
    logger.info('SMS sent', {
      template: sms.template,
      phoneSuffix: phone.slice(-2),
      requestId: body.message,
    });
  }
}

function createSmsProvider(): SmsProvider {
  if (env.SMS_PROVIDER === 'msg91' && env.NODE_ENV !== NodeEnvironment.Test) {
    return new Msg91SmsProvider({
      authKey: env.MSG91_AUTH_KEY ?? '',
      templateIds: {
        otp: env.MSG91_TEMPLATE_OTP ?? '',
        complaint_resolved: env.MSG91_TEMPLATE_COMPLAINT_RESOLVED ?? '',
      },
    });
  }
  return new ConsoleSmsProvider();
}

export const sms: SmsProvider = createSmsProvider();

/** Fire-and-forget notification: an SMS failure must never fail the business action. */
export function sendSmsInBackground(phone: string, message: SmsTemplate): void {
  sms.send(phone, message).catch((error: unknown) => {
    logger.error('SMS delivery failed', {
      template: message.template,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });
}
