/** Shared runtime-config fetch result (single network round-trip). */
export type RuntimeConfigJson = {
  apiUrl?: string;
  googleClientId?: string;
  appleClientId?: string;
  conductorEnabled?: boolean;
};
