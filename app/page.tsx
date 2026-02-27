// app/contact/page.tsx

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      {/* Page-level animation keyframes (no extra deps) */}
      <style jsx global>{`
        @keyframes gl-fade-up {
          from {
            opacity: 0;
            transform: translateY(14px);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
        @keyframes gl-float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        .gl-animate-in {
          animation: gl-fade-up 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .gl-animate-in-delay-1 {
          animation-delay: 120ms;
        }
        .gl-animate-in-delay-2 {
          animation-delay: 240ms;
        }
        .gl-animate-in-delay-3 {
          animation-delay: 360ms;
        }
        .gl-float {
          animation: gl-float 6s ease-in-out infinite;
        }
      `}</style>

      {/* Subtle grid backdrop */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,black_1px,transparent_1px),linear-gradient(to_bottom,black_1px,transparent_1px)] [background-size:72px_72px]" />

      <section className="relative px-6 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          {/* Split layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* LEFT: High-end copy + contact */}
            <div className="lg:col-span-6 xl:col-span-7">
              <div className="gl-animate-in">
                <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs tracking-wide text-black/70">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-black/60" />
                  Guestlist Social · Contact
                </div>

                <h1 className="mt-6 text-4xl md:text-5xl font-semibold leading-[1.08]">
                  Let’s turn attention into{" "}
                  <span className="underline decoration-black/20 underline-offset-[6px]">
                    consistent sales.
                  </span>
                </h1>

                <p className="mt-5 text-lg text-black/70 max-w-xl gl-animate-in gl-animate-in-delay-1">
                  Premium social media strategy + execution for brands that want
                  clarity, creative excellence, and measurable growth.
                </p>
              </div>

              {/* Contact cards */}
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a
                  href="mailto:nelly@guestlistsocial.com"
                  className="gl-animate-in gl-animate-in-delay-2 group rounded-2xl border border-black/10 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-black/50">
                        Email
                      </p>
                      <p className="mt-2 text-lg font-medium group-hover:underline underline-offset-4">
                        nelly@guestlistsocial.com
                      </p>
                      <p className="mt-2 text-sm text-black/60">
                        Best for briefs, links, and next steps.
                      </p>
                    </div>
                    <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-black/5 text-black/70">
                      ↗
                    </span>
                  </div>
                </a>

                <a
                  href="tel:07537142056"
                  className="gl-animate-in gl-animate-in-delay-3 group rounded-2xl border border-black/10 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-black/50">
                        Phone
                      </p>
                      <p className="mt-2 text-lg font-medium group-hover:underline underline-offset-4">
                        07537 142 056
                      </p>
                      <p className="mt-2 text-sm text-black/60">
                        Quick questions & availability.
                      </p>
                    </div>
                    <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-black/5 text-black/70">
                      ↗
                    </span>
                  </div>
                </a>
              </div>

              {/* Proof / expectations */}
              <div className="mt-10 rounded-2xl border border-black/10 bg-white p-6 text-black/70">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-black">What to expect</p>
                    <p className="mt-1 text-sm text-black/60">
                      A clean process: brief → strategy → content → reporting.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Strategy", "Content Systems", "Paid + Organic", "Reporting"].map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: Elevated panel + form (optional) */}
            <div className="lg:col-span-6 xl:col-span-5">
              <div className="relative h-full rounded-3xl border border-black/10 bg-gradient-to-b from-black/[0.04] to-transparent p-6 md:p-8 overflow-hidden">
                {/* Floating accent orb */}
                <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-black/10 blur-2xl gl-float" />
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-black/10 blur-2xl gl-float" />

                <div className="relative">
                  <p className="text-xs uppercase tracking-wide text-black/50">
                    Quick enquiry
                  </p>
                  <h2 className="mt-3 text-2xl md:text-3xl font-semibold">
                    Tell us what you’re building.
                  </h2>
                  <p className="mt-3 text-sm text-black/60">
                    This form is a simple starter. If you’d rather, email directly and
                    include links + goals.
                  </p>

                  <form
                    className="mt-8 space-y-4"
                    // Note: no backend wired here (kept safe + simple). You can connect Basin/Forms later.
                    onSubmit={(e) => e.preventDefault()}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-black/70 mb-2">
                          Name
                        </label>
                        <input
                          type="text"
                          placeholder="Your name"
                          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-black/30"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-black/70 mb-2">
                          Email
                        </label>
                        <input
                          type="email"
                          placeholder="you@company.com"
                          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-black/30"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-black/70 mb-2">
                        What do you need help with?
                      </label>
                      <textarea
                        rows={5}
                        placeholder="e.g., premium content system, IG growth, paid campaigns, brand strategy..."
                        className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-black/30 resize-none"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                      >
                        Send enquiry
                      </button>

                      <a
                        href="mailto:nelly@guestlistsocial.com?subject=Guestlist%20Social%20Enquiry"
                        className="inline-flex items-center justify-center rounded-xl border border-black/15 bg-white px-5 py-3 text-sm font-medium text-black hover:bg-black/5 transition-colors"
                      >
                        Or email directly
                      </a>
                    </div>

                    <p className="text-xs text-black/50 pt-2">
                      Prefer WhatsApp? Use the phone number and we’ll respond ASAP.
                    </p>
                  </form>

                  {/* Mini footer inside panel */}
                  <div className="mt-10 flex items-center justify-between text-xs text-black/50">
                    <span>Response time: typically within 24–48 hrs</span>
                    <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1">
                      High-end socials
                    </span>
                  </div>
                </div>
              </div>

              {/* Optional trust strip */}
              <div className="mt-4 rounded-2xl border border-black/10 bg-white px-5 py-4 text-sm text-black/60">
                <span className="text-black font-medium">Tip:</span> Add your website + IG/TikTok links in the message
                for a faster, sharper response.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}