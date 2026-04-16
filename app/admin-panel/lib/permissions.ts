export type UserRole = "admin" | "manager" | "member" | "viewer";

export type Actor = {
  email: string;
  role: UserRole;
};

export function defaultRoleFromEmail(email: string): UserRole {
  if (!email) return "viewer";
  return "member";
}
