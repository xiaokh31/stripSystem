import { BlockList, isIP } from 'node:net';
import type { Request } from 'express';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';

export function createTrustedProxyPredicate(cidrs: string[]) {
  const blockList = new BlockList();
  for (const cidr of cidrs) {
    const [address, prefixText] = cidr.split('/');
    const family = isIP(address);
    blockList.addSubnet(
      address,
      Number(prefixText),
      family === 6 ? 'ipv6' : 'ipv4',
    );
  }

  return (address: string): boolean => {
    const normalized = normalizeIpAddress(address);
    const family = isIP(normalized);
    return family !== 0 && blockList.check(normalized, family === 6 ? 'ipv6' : 'ipv4');
  };
}

export function canonicalClientAddress(
  request: Request,
  configuration: PublicDeploymentConfiguration,
): string | null {
  const peer = normalizeIpAddress(request.socket.remoteAddress ?? '');
  const trusted = createTrustedProxyPredicate(
    configuration.trustedProxyCidrs,
  )(peer);

  if (
    trusted &&
    configuration.trustedProxyMode === 'cloudflare-tunnel'
  ) {
    const cloudflareAddress = firstHeaderValue(
      request.headers['cf-connecting-ip'],
    );
    if (cloudflareAddress && isIP(cloudflareAddress)) {
      return normalizeIpAddress(cloudflareAddress);
    }
  }

  return normalizeIpAddress(request.ip || peer) || null;
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value?.split(',')[0];
  const trimmed = first?.trim();
  return trimmed || null;
}

function normalizeIpAddress(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}
