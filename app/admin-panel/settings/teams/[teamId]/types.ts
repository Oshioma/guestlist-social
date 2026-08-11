// Shared types for the team detail components, kept separate from the page so
// the client components don't import a route module.

// 'member' is surfaced in the UI as "Creator" (drafts-only). 'proofer' can
// approve posts. 'owner' is the backend team-creator marker; 'client' is the
// portal viewer. Assignable in the UI: admin / proofer / creator(member).
export type Role = "owner" | "admin" | "proofer" | "member" | "client";

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
