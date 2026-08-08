// Shared types for the team detail components, kept separate from the page so
// the client components don't import a route module.

export type Role = "owner" | "admin" | "member" | "client";

export type TeamMember = {
  userId: string;
  email: string;
  fullName: string | null;
  role: Role;
  isOwner: boolean;
};

export type AccountOption = {
  clientId: number;
  name: string;
  inTeam: boolean;
};
