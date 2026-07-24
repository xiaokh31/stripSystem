export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  authDelivery?: 'bearer' | 'browser' | 'legacy-browser';
  authSessionId?: string;
}
import type { Request } from 'express';
