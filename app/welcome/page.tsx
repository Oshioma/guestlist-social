import Link from "next/link";
import type { Metadata } from "next";
import { publicSignupEnabled } from "@/lib/auth/public-signup";
import "./welcome.css";

export const metadata: Metadata = {
  title: "PostProofer — Plan, proof & schedule your social posts",
  description:
    "A calendar-first workspace for planning content, getting client sign-off, and publishing to Instagram and Facebook.",
  openGraph: {
    title: "PostProofer — Plan, proof & schedule your social posts",
    description:
      "A calendar-first workspace for planning content, getting client sign-off, and publishing to Instagram and Facebook.",
    type: "website",
  },
};

type Feature = {
  title: string;
  body: string;
  tone: "violet" | "teal" | "amber";
  icon: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Monthly calendar",
    body: "See the whole month at a glance. Draft, drag and drop, and slot posts into the days that matter.",
    tone: "violet",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    title: "Proof & approve",
    body: "Share a clean view with clients, collect feedback, and get sign-off before anything goes live.",
    tone: "teal",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
        <path d="M9 11l3 3L22 4" />
      </svg>
    ),
  },
  {
    title: "Publish automatically",
    body: "Schedule once and PostProofer posts to Instagram (Feed + Stories) and Facebook for you.",
    tone: "amber",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    ),
  },
];

export default function WelcomePage() {
  const canSignUp = publicSignupEnabled();

  return (
    <main className="welcome">
      <header className="welcome-nav">
        <span className="welcome-brand">
          Post<span className="welcome-brand-accent">Proofer</span>
        </span>
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
        <span className="welcome-eyebrow">Social scheduling, done calmly</span>
        <h1 className="welcome-title">
          Plan, <span className="welcome-title-accent">proof</span> &amp;
          schedule your social posts.
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
            <span className={`welcome-feature-icon tone-${f.tone}`}>
              {f.icon}
            </span>
            <h2 className="welcome-feature-title">{f.title}</h2>
            <p className="welcome-feature-body">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="welcome-footer">
        <span>© {new Date().getFullYear()} PostProofer</span>
        <Link href="/privacy" className="welcome-link">
          Privacy
        </Link>
      </footer>
    </main>
  );
}
