import { describe, expect, it } from 'vitest';
import { assertSameOrigin, RequestError } from '../src/lib/application/request';

function browserRequest(headers: HeadersInit = {}): Request {
  return new Request('http://localhost/api/corpus', {
    method: 'POST',
    headers,
  });
}

describe('assertSameOrigin', () => {
  it('allows a matching browser Origin', () => {
    expect(() =>
      assertSameOrigin(browserRequest({ origin: 'http://localhost', host: 'LOCALHOST' })),
    ).not.toThrow();
  });

  it('rejects a cross-origin mutation', () => {
    try {
      assertSameOrigin(browserRequest({ origin: 'https://attacker.example', host: 'localhost' }));
      throw new Error('Expected origin validation to reject the request');
    } catch (error) {
      expect(error).toBeInstanceOf(RequestError);
      expect((error as RequestError).status).toBe(403);
    }
  });

  it('rejects malformed Origin values', () => {
    expect(() =>
      assertSameOrigin(browserRequest({ origin: 'not-an-origin', host: 'localhost' })),
    ).toThrow('Invalid Origin header');
  });

  it('rejects browser requests with Origin but no Host', () => {
    expect(() => assertSameOrigin(browserRequest({ origin: 'http://localhost' }))).toThrow(
      'Host header is required for browser requests',
    );
  });

  it('allows requests without an Origin header for non-browser clients', () => {
    expect(() => assertSameOrigin(browserRequest())).not.toThrow();
  });
});
