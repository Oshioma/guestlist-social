// Shared inline styles for the teams management forms. Matches the zinc
// palette used across the admin panel (see settings/members).

import type { CSSProperties } from "react";

export const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 4,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  boxSizing: "border-box",
};

export const errorBoxStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 12,
};

export const successBoxStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#15803d",
  fontSize: 12,
};

export const fieldErrorStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 11,
  color: "#b91c1c",
};

export function primaryButtonStyle(isPending: boolean): CSSProperties {
  return {
    alignSelf: "flex-start",
    background: "#18181b",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: isPending ? "wait" : "pointer",
    opacity: isPending ? 0.7 : 1,
  };
}

export function secondaryButtonStyle(isPending: boolean): CSSProperties {
  return {
    background: "#fff",
    color: "#18181b",
    border: "1px solid #e4e4e7",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: isPending ? "wait" : "pointer",
    opacity: isPending ? 0.7 : 1,
  };
}
