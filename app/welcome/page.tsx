import Link from "next/link";
import type { Metadata } from "next";
import { publicSignupEnabled } from "@/lib/auth/public-signup";
import "./welcome.css";

export const metadata: Metadata = {
  title: "Proofer — Plan, proof & schedule your social posts",
  description:
    "A calendar-first workspace for planning content, getting client sign-off, and publishing to Instagram and Facebook.",
  openGraph: {
    title: "Proofer — Plan, proof & schedule your social posts",
    description:
      "A calendar-first workspace for planning content, getting client sign-off, and publishing to Instagram and Facebook.",
    type: "website",
  },
};

const FEATURES = [
  {
    title: "Monthly calendar",
    body: "See the whole month at a glance. Draft, drag and drop, and slot posts into the days that matter.",
  },
  {
    title: "Proof & approve",
    body: "Share a clean view with clients, collect feedback, and get sign-off before anything goes live.",
  },
  {
    title: "Publish automatically",
    body: "Schedule once and Proofer posts to Instagram (Feed + Stories) and Facebook for you.",
  },
];

export default function WelcomePage() {
  const canSignUp = publicSignupEnabled();

  return (
    <main className="welcome">
      <header className="welcome-nav">
        <span className="welcome-brand">Proofer</span>
        <nav className="welcome-nav-links">
          <Link href="/sign-in" className="welcome-link">
            Sign in
          </Link>
          {canSignUp && (
            <Link href="/sign-up" className="welcome-btn welcome-btn-sm">
              Sign up
            </Link>
          )}
        </nav>
      </header>

      <section className="welcome-hero">
        <h1 className="welcome-title">
          Plan, proof &amp; schedule your social posts.
        </h1>
        <p className="welcome-subtitle">
          A calendar-first workspace for planning content, getting client
          sign-off, and publishing to Instagram and Facebook — all in one place.
        </p>
        <div className="welcome-cta">
          {canSignUp ? (
            <>
              <Link href="/sign-up" className="welcome-btn">
                Get started free
              </Link>
              <Link href="/sign-in" className="welcome-btn welcome-btn-ghost">
                Sign in
              </Link>
            </>
          ) : (
            <Link href="/sign-in" className="welcome-btn">
              Sign in
            </Link>
          )}
        </div>
        {canSignUp && (
          <p className="welcome-note">
            Sign up and you&apos;ll get your own team — add your social accounts
            and start posting.
          </p>
        )}
      </section>

      <section className="welcome-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="welcome-feature">
            <h2 className="welcome-feature-title">{f.title}</h2>
            <p className="welcome-feature-body">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="welcome-footer">
        <span>© {new Date().getFullYear()} Proofer</span>
        <Link href="/privacy" className="welcome-link">
          Privacy
        </Link>
      </footer>
    </main>
  );
}
