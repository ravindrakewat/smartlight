import { describe, expect, it } from 'vitest';
import { Msg91SmsProvider } from '../src/lib/sms';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const templateIds = { otp: 'tpl-otp', complaint_resolved: 'tpl-resolved' };

describe('Msg91SmsProvider', () => {
  it('sends a DLT flow template with the number in MSG91 format', async () => {
    const { impl, calls } = fakeFetch(200, { type: 'success', message: 'req-1' });
    const provider = new Msg91SmsProvider({ authKey: 'key-1', templateIds, fetchImpl: impl });

    await provider.send('+919876543210', { template: 'otp', code: '482913' });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('https://control.msg91.com/api/v5/flow');
    expect(call?.init.method).toBe('POST');
    expect((call?.init.headers as Record<string, string>).authkey).toBe('key-1');
    expect(JSON.parse(call?.init.body as string)).toEqual({
      template_id: 'tpl-otp',
      short_url: '0',
      recipients: [{ mobiles: '919876543210', var1: '482913' }],
    });
  });

  it('uses the resolution template for resolved complaints', async () => {
    const { impl, calls } = fakeFetch(200, { type: 'success', message: 'req-2' });
    const provider = new Msg91SmsProvider({ authKey: 'k', templateIds, fetchImpl: impl });

    await provider.send('+919876543210', {
      template: 'complaint_resolved',
      complaintNumber: 'IND-C-000123',
    });

    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body.template_id).toBe('tpl-resolved');
    expect(body.recipients[0].var1).toBe('IND-C-000123');
  });

  it('treats an HTTP 200 with type "error" as a failure', async () => {
    const { impl } = fakeFetch(200, { type: 'error', message: 'Invalid template' });
    const provider = new Msg91SmsProvider({ authKey: 'k', templateIds, fetchImpl: impl });

    await expect(provider.send('+919876543210', { template: 'otp', code: '1' })).rejects.toThrow(
      /Invalid template/,
    );
  });

  it('fails on an auth error', async () => {
    const { impl } = fakeFetch(401, { type: 'error', message: 'Invalid authkey' });
    const provider = new Msg91SmsProvider({ authKey: 'bad', templateIds, fetchImpl: impl });

    await expect(provider.send('+919876543210', { template: 'otp', code: '1' })).rejects.toThrow(
      /HTTP 401/,
    );
  });
});
