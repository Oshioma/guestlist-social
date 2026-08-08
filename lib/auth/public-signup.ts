// Public self-serve sign-up is OFF by default. The app is invite-only unless
// ENABLE_PUBLIC_SIGNUP is explicitly set to "true" — this keeps the anti-bot
// guardrail the codebase deliberately shipped, while allowing self-serve
// sign-up to be switched on when the team is ready for it.
//
// Server-only value (not NEXT_PUBLIC): the flag is read in server components
// and server actions, and the /sign-up route + the sign-in page's link are
// gated on it. A client that forces its way to the form still hits the same
// check in signUpWithPassword().

export function publicSignupEnabled(): boolean {
  return process.env.ENABLE_PUBLIC_SIGNUP === "true";
}
