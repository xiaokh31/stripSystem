export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}
