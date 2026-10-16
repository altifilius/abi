import { afterEach, describe, expect, it } from 'bun:test';
import { ApiError, api, clearSession } from '../services/api';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearSession();
});
describe('Readable private request failures', () => {
  it('does not expose submitted secrets from validation input', async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { detail: [{ loc: ['body', 'password'], msg: 'Too short', input: 'SECRET-PASSWORD' }] },
        { status: 422 },
      )) as unknown as typeof fetch;
    try {
      await api('/auth/register', { method: 'POST', json: { password: 'SECRET-PASSWORD' } });
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Error).message).toContain('Too short');
      expect((error as Error).message).not.toContain('SECRET');
    }
  });
  it('shows required application issues without private request data', async () => {
    globalThis.fetch = (async () =>
      Response.json(
        {
          detail: {
            code: 'application_not_ready',
            errors: [
              {
                field: 'sections.problem',
                message: 'Required section is missing',
                input: 'PRIVATE-DRAFT',
              },
            ],
          },
        },
        { status: 409 },
      )) as unknown as typeof fetch;
    await expect(api('/programs')).rejects.toThrow('Required section is missing');
  });
  it('does not render untrusted server HTML as a request message', async () => {
    globalThis.fetch = (async () =>
      new Response('<script>private backend details</script>', {
        status: 502,
      })) as unknown as typeof fetch;
    try {
      await api('/programs');
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Error).message).not.toContain('script');
      expect((error as Error).message).not.toContain('private');
    }
  });
});
