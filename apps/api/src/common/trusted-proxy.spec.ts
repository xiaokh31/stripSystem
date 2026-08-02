import type { Request } from 'express';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';
import {
  canonicalClientAddress,
  createTrustedProxyPredicate,
} from './trusted-proxy';

const configuration: PublicDeploymentConfiguration = {
  allowedOrigins: ['https://warehouse.example.com'],
  authRateLimitFailClosed: true,
  authRateLimitMax: 10,
  authRateLimitWindowSeconds: 60,
  baseUrl: 'https://warehouse.example.com',
  browserAccessExpiresInSeconds: 900,
  browserSessionAbsoluteExpiresInSeconds: 34_560_000,
  browserSessionIdleExpiresInSeconds: 34_560_000,
  cookieSecure: true,
  lanBrowserEnabled: false,
  lanBrowserOrigins: [],
  enabled: true,
  trustedProxyCidrs: ['172.20.0.0/16'],
  trustedProxyMode: 'cloudflare-tunnel',
};

describe('trusted proxy client identity', () => {
  it('matches only explicit CIDRs, including IPv4-mapped peers', () => {
    const trusted = createTrustedProxyPredicate(configuration.trustedProxyCidrs);
    expect(trusted('172.20.4.9')).toBe(true);
    expect(trusted('::ffff:172.20.4.9')).toBe(true);
    expect(trusted('198.51.100.7')).toBe(false);
  });

  it('accepts Cloudflare client identity only from a trusted peer', () => {
    expect(
      canonicalClientAddress(
        requestFixture('172.20.4.9', '203.0.113.8'),
        configuration,
      ),
    ).toBe('203.0.113.8');
  });

  it('ignores spoofed forwarding headers on direct requests', () => {
    expect(
      canonicalClientAddress(
        requestFixture('198.51.100.7', '203.0.113.8'),
        configuration,
      ),
    ).toBe('198.51.100.7');
  });

  it('ignores Cloudflare identity on a trusted LAN ingress', () => {
    expect(
      canonicalClientAddress(
        requestFixture('172.20.4.9', '203.0.113.8', 'lan'),
        configuration,
      ),
    ).toBe('172.20.4.9');
  });
});

function requestFixture(peer: string, cloudflare: string, ingress = 'public'): Request {
  return {
    headers: {
      'cf-connecting-ip': cloudflare,
      'x-bestar-browser-ingress': ingress,
    },
    ip: peer,
    socket: { remoteAddress: peer },
  } as unknown as Request;
}
