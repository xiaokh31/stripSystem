import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { createTrustedProxyPredicate } from '../common/trusted-proxy';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';

export const BROWSER_INGRESS_HEADER = 'x-bestar-browser-ingress';

export type BrowserIngressType = 'lan' | 'local' | 'public';

export interface BrowserIngressPolicy {
  origin: string;
  secure: boolean;
  type: BrowserIngressType;
}

export function resolveBrowserIngressPolicy(
  request: Request,
  configuration: PublicDeploymentConfiguration,
  requireOrigin = true,
): BrowserIngressPolicy {
  if (!configuration.enabled) {
    const origin = `${request.protocol}://${request.get('host') ?? ''}`;
    if (requireOrigin) assertSuppliedOrigin(request, [origin, ...configuration.allowedOrigins]);
    return { origin, secure: configuration.cookieSecure, type: 'local' };
  }

  const peer = normalizeIpAddress(request.socket.remoteAddress ?? '');
  if (!createTrustedProxyPredicate(configuration.trustedProxyCidrs)(peer)) {
    reject('UNTRUSTED_BROWSER_INGRESS');
  }

  const ingress = singleHeaderValue(request.headers[BROWSER_INGRESS_HEADER]);
  const forwardedProto = singleHeaderValue(request.headers['x-forwarded-proto']);
  const host = request.get('host') ?? '';
  let policy: BrowserIngressPolicy;

  if (ingress === 'public') {
    const publicOrigin = configuration.baseUrl ? new URL(configuration.baseUrl).origin : '';
    if (forwardedProto !== 'https' || `https://${host}` !== publicOrigin) {
      reject('PUBLIC_BROWSER_INGRESS_MISMATCH');
    }
    policy = { origin: publicOrigin, secure: true, type: 'public' };
  } else if (ingress === 'lan') {
    const lanOrigin = `http://${host}`;
    if (
      !configuration.lanBrowserEnabled ||
      forwardedProto !== 'http' ||
      singleHeaderValue(request.headers['cf-connecting-ip']) !== null ||
      !configuration.lanBrowserOrigins.includes(lanOrigin)
    ) {
      reject('LAN_BROWSER_INGRESS_MISMATCH');
    }
    policy = { origin: lanOrigin, secure: false, type: 'lan' };
  } else {
    reject('BROWSER_INGRESS_CLASS_REQUIRED');
  }

  if (requireOrigin) assertSuppliedOrigin(request, [policy.origin]);
  return policy;
}

export function isPublicBrowserIngress(
  request: Request,
  configuration: PublicDeploymentConfiguration,
): boolean {
  try {
    return resolveBrowserIngressPolicy(request, configuration, false).type === 'public';
  } catch {
    return false;
  }
}

function assertSuppliedOrigin(request: Request, allowedOrigins: string[]): void {
  const supplied = request.get('origin') ?? request.get('referer');
  let origin: string | null = null;
  try {
    origin = supplied ? new URL(supplied).origin : null;
  } catch {
    origin = null;
  }
  if (!origin || !allowedOrigins.includes(origin)) {
    reject('CSRF_ORIGIN_REJECTED');
  }
}

function singleHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value.length === 1 ? value[0].trim() : null;
  if (!value || value.includes(',')) return null;
  return value.trim() || null;
}

function normalizeIpAddress(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

function reject(code: string): never {
  throw new ForbiddenException({ code, message: code, details: {} });
}
