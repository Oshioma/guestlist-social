import type { Client, Ad, Creative, Report, Suggestion } from "./types";

export type AdminRole = "admin" | "viewer";

export type AdminActor = {
  email: string;
  role: AdminRole;
};

export function isAdmin(actor: AdminActor): boolean {
  return actor.role === "admin";
}

export function canViewClient(actor: AdminActor, _client: Client): boolean {
  return actor.role === "admin";
}

export function canEditClient(actor: AdminActor, _client: Client): boolean {
  return actor.role === "admin";
}

export function canDeleteClient(actor: AdminActor, _client: Client): boolean {
  return actor.role === "admin";
}

export function canViewAd(actor: AdminActor, _ad: Ad): boolean {
  return actor.role === "admin";
}

export function canEditAd(actor: AdminActor, _ad: Ad): boolean {
  return actor.role === "admin";
}

export function canDeleteAd(actor: AdminActor, _ad: Ad): boolean {
  return actor.role === "admin";
}

export function canViewCreative(actor: AdminActor, _creative: Creative): boolean {
  return actor.role === "admin";
}

export function canEditCreative(actor: AdminActor, _creative: Creative): boolean {
  return actor.role === "admin";
}

export function canDeleteCreative(actor: AdminActor, _creative: Creative): boolean {
  return actor.role === "admin";
}

export function canViewReport(actor: AdminActor, _report: Report): boolean {
  return actor.role === "admin";
}

export function canDeleteReport(actor: AdminActor, _report: Report): boolean {
  return actor.role === "admin";
}

export function canViewSuggestion(actor: AdminActor, _suggestion: Suggestion): boolean {
  return actor.role === "admin";
}

export function canDismissSuggestion(actor: AdminActor, _suggestion: Suggestion): boolean {
  return actor.role === "admin";
}
