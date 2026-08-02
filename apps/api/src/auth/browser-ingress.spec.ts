import type { Request } from 'express';
import { parsePublicDeploymentConfiguration } from '../config/public-deployment.config';
import { resolveBrowserIngressPolicy } from './browser-ingress';

describe('browser ingress policy', () => {
  const configuration = parsePublicDeploymentConfiguration({
    authRateLimitFailClosed: 'true',
    browserCookieSecure: 'true',
    corsOrigins: 'https://warehouse.example.test',
    jwtSecret: 'contract-only-secret-value-that-is-long-enough',
    lanBrowserEnabled: 'true',
    lanBrowserOrigins: 'http://192.168.20.15',
    publicBaseUrl: 'https://warehouse.example.test',
    publicDeploymentEnabled: 'true',
    redisUrl: 'redis://redis:6379',
    trustedProxyCidrs: '127.0.0.0/8',
    trustedProxyMode: 'cloudflare-tunnel',
  });

  it.each([
    ['public', 'https', 'warehouse.example.test', 'https://warehouse.example.test', true],
    ['lan', 'http', '192.168.20.15', 'http://192.168.20.15', false],
  ])('classifies trusted %s ingress with request-aware cookies', (ingress, proto, host, origin, secure) => {
    expect(resolveBrowserIngressPolicy(requestFixture({ ingress, proto, host, origin }), configuration)).toEqual({
      origin,
      secure,
      type: ingress,
    });
  });

  it.each([
    [{ ingress: 'public', proto: 'https', host: 'warehouse.example.test', origin: 'http://192.168.20.15' }, 'CSRF_ORIGIN_REJECTED'],
    [{ ingress: 'lan', proto: 'http', host: '192.168.20.15', origin: 'https://warehouse.example.test' }, 'CSRF_ORIGIN_REJECTED'],
    [{ ingress: 'lan', proto: 'https', host: '192.168.20.15', origin: 'http://192.168.20.15' }, 'LAN_BROWSER_INGRESS_MISMATCH'],
    [{ ingress: 'public', proto: 'https', host: 'wrong.example.test', origin: 'https://warehouse.example.test' }, 'PUBLIC_BROWSER_INGRESS_MISMATCH'],
    [{ ingress: 'public', proto: 'https', host: 'warehouse.example.test', origin: '' , peer: '203.0.113.8'}, 'UNTRUSTED_BROWSER_INGRESS'],
    [{ ingress: 'lan', proto: 'http', host: '192.168.20.15', origin: 'http://192.168.20.15', cfConnectingIp: '198.51.100.4' }, 'LAN_BROWSER_INGRESS_MISMATCH'],
  ])('fails closed for cross-origin or spoofed input %#', (input, code) => {
    expect(() => resolveBrowserIngressPolicy(requestFixture(input), configuration)).toThrow(code);
  });
});

function requestFixture(input: {
  host: string;
  cfConnectingIp?: string;
  ingress: string;
  origin: string;
  peer?: string;
  proto: string;
}): Request {
  const headers: Record<string, string> = {
    host: input.host,
    origin: input.origin,
    'x-bestar-browser-ingress': input.ingress,
    'x-forwarded-proto': input.proto,
  };
  if (input.cfConnectingIp) headers['cf-connecting-ip'] = input.cfConnectingIp;
  return {
    get: (name: string) => headers[name.toLowerCase()],
    headers,
    protocol: 'http',
    socket: { remoteAddress: input.peer ?? '127.0.0.1' },
  } as unknown as Request;
}
