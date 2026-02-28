"use client";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen bg-black text-white overflow-hidden">
      {/* ===== Animations (local, no deps) ===== */}
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
        .gl-animate-in-delay-4 {
          animation-delay: 480ms;
        }
        .gl-float {
          animation: gl-float 6s ease-in-out infinite;
        }
      `}</style>

      {/* ===== FIXED BACKGROUND (FULL IMAGE VISIBLE) ===== */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-black flex items-center justify-center"
      >
        {/* Full image visible (no cropping) */}
        <img
          src="/hero-island.jpg"
          alt=""
          className="max-h-full max-w-full object-contain"
        />

        {/* Readability overlay */}
        <div className="absolute inset-0 bg-black/45" />

        {/* Subtle texture (adds premium depth) */}
        <div className="absolute inset-0 opacity-[0.12]">
          <img
            src="/texture-water.jpg"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>

        {/* Top fade (header legibility) */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />

        {/* Bottom fade (nice exit + section transition) */}
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* ===== CONTENT ===== */}
      <div className="relative z-10">
        {/* Header */}
        <header className="px-6 py-6 max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">
            Guestlist Social
          </div>

          <nav className="hidden md:flex gap-8 text-sm text-white/85">
            <a href="#services" className="hover:text-white">
              Services
            </a>
            <a href="#work" className="hover:text-white">
              Work
            </a>
            <a href="#contact" className="hover:text-white">
              Contact
            </a>
          </nav>

          <a
            href="#contact"
            className="bg-white text-black px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition"
          >
            Work With Us
          </a>
        </header>

        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-20 md:pt-28 md:pb-28 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7 gl-animate-in">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-xs text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
              Corporate delivery. Island execution.
            </div>

            <h1 className="mt-6 text-5xl md:text-7xl font-semibold leading-[1.03] tracking-tight">
              We build brands that don’t scroll.
              <span className="text-white/75"> They stop attention.</span>
            </h1>

            <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl gl-animate-in gl-animate-in-delay-1">
              Guestlist Social is a premium content and growth partner for brands
              that want presence, clarity, and performance — without noise.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3 gl-animate-in gl-animate-in-delay-2">
              <a
                href="#contact"
                className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90"
              >
                Start a Conversation
              </a>
              <a
                href="#services"
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-white hover:border-white/60"
              >
                View Services
              </a>
            </div>
          </div>

          {/* Right hero card */}
          <div className="md:col-span-5">
            <div className="relative rounded-3xl overflow-hidden bg-white/10 ring-1 ring-white/15 backdrop-blur-[2px]">
              <div className="absolute inset-0">
                <img
                  src="/hero-grain.jpg"
                  alt=""
                  className="h-full w-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" />
              </div>

              <div className="relative p-6 md:p-8">
                <div className="text-sm text-white/85">Weekly Content Engine</div>
                <h3 className="mt-3 text-2xl font-semibold">
                  Structured. Consistent. Premium.
                </h3>

                <ul className="mt-6 space-y-3 text-white/85 text-sm">
                  <li>• Hook scripting & content planning</li>
                  <li>• Premium editing & pacing</li>
                  <li>• Caption + publishing workflow</li>
                  <li>• Monthly growth review</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 rounded-3xl overflow-hidden bg-white/10 ring-1 ring-white/15 backdrop-blur-[2px]">
              <div className="relative h-44">
                <img
                  src="/proof-meeting.jpg"
                  alt="Proof"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />
              </div>
              <div className="p-5">
                <div className="text-xs text-white/80">Executive standard</div>
                <div className="mt-1 text-sm text-white/95">
                  Strategy and delivery with a boardroom-level finish.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Services */}
        <section
          id="services"
          className="border-t border-white/10 bg-black/80 backdrop-blur-[2px] py-20 px-6"
        >
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-semibold tracking-tight">What We Do</h2>

            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {[
                {
                  title: "Strategy",
                  desc: "Positioning, content pillars, and direction that aligns attention with revenue.",
                },
                {
                  title: "Content Production",
                  desc: "Short-form video, creative editing, and visual storytelling that feels intentional and premium.",
                },
                {
                  title: "Growth",
                  desc: "Testing, iteration, and performance refinement to turn attention into measurable outcomes.",
                },
              ].map((service) => (
                <div
                  key={service.title}
                  className="rounded-3xl bg-white/5 border border-white/10 p-8"
                >
                  <h3 className="text-lg font-semibold">{service.title}</h3>
                  <p className="mt-4 text-white/70 text-sm leading-relaxed">
                    {service.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Work */}
        <section
          id="work"
          className="border-t border-white/10 bg-black/80 backdrop-blur-[2px] py-20 px-6"
        >
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-semibold tracking-tight">Selected Work</h2>
            <p className="mt-4 text-white/70 max-w-2xl">
              We help brands sharpen their presence and build systems that compound.
              Case studies available upon request.
            </p>

            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {["Brand Launch", "Content System", "Growth Execution"].map((item) => (
                <div
                  key={item}
                  className="rounded-3xl bg-white/5 border border-white/10 p-8"
                >
                  <div className="text-sm text-white/60">Case Study</div>
                  <div className="mt-3 text-lg font-semibold">{item}</div>
                  <div className="mt-6 h-28 rounded-2xl bg-black/30 border border-white/10" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section
          id="contact"
          className="border-t border-white/10 bg-black/80 backdrop-blur-[2px] py-20 px-6"
        >
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* LEFT */}
              <div className="lg:col-span-6 xl:col-span-7">
                <div className="gl-animate-in">
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Ready to build something that stops attention?
                  </h2>
                  <p className="mt-4 text-white/70 max-w-xl gl-animate-in gl-animate-in-delay-1">
                    Tell us about your brand and your goals. We’ll reply with clarity — and a
                    simple path forward. No booking links.
                  </p>
                  <p className="mt-3 text-sm text-white/60 gl-animate-in gl-animate-in-delay-2">
                    Typical reply within{" "}
                    <span className="text-white/80 font-medium">24–48 hours</span>. Urgent?
                    <span className="text-white/80 font-medium"> Call us.</span>
                  </p>
                </div>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <a
                    href="mailto:nelly@guestlistsocial.com?subject=Guestlist%20Social%20Enquiry"
                    className="gl-animate-in gl-animate-in-delay-3 group rounded-3xl bg-white/5 border border-white/10 p-7 hover:bg-white/7 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-white/60">
                          Email
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white group-hover:underline underline-offset-4">
                          nelly@guestlistsocial.com
                        </div>
                        <div className="mt-2 text-sm text-white/65">
                          Best for briefs, links, and context.
                        </div>
                      </div>
                      <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 text-white/85">
                        ↗
                      </span>
                    </div>
                  </a>

                  <a
                    href="tel:07537142056"
                    className="gl-animate-in gl-animate-in-delay-4 group rounded-3xl bg-white/5 border border-white/10 p-7 hover:bg-white/7 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-white/60">
                          Phone
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white group-hover:underline underline-offset-4">
                          07537 142 056
                        </div>
                        <div className="mt-2 text-sm text-white/65">
                          Quick questions & availability.
                        </div>
                      </div>
                      <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 text-white/85">
                        ↗
                      </span>
                    </div>
                  </a>
                </div>

                <div className="mt-8 rounded-3xl bg-white/5 border border-white/10 p-7">
                  <div className="text-sm font-semibold text-white">
                    To get a sharp reply, include:
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-white/70">
                    <li>• Website + Instagram/TikTok links</li>
                    <li>• What you sell + ideal customer</li>
                    <li>• Your goal for the next 30–90 days</li>
                    <li>• 1–2 brands you like (style reference)</li>
                  </ul>
                </div>
              </div>

              {/* RIGHT */}
              <div className="lg:col-span-6 xl:col-span-5">
                <div className="relative h-full rounded-3xl overflow-hidden bg-white/5 border border-white/10">
                  <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl gl-float" />
                  <div className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-white/10 blur-2xl gl-float" />

                  <div className="relative p-7 md:p-8">
                    <div className="text-xs uppercase tracking-wide text-white/60">
                      Quick enquiry
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold">
                      Tell us what you’re building.
                    </h3>
                    <p className="mt-3 text-sm text-white/70">
                      This form is a clean starter. If you want it to actually send submissions,
                      I’ll wire it to Basin/Formspree/Supabase next.
                    </p>

                    <form
                      className="mt-7 space-y-4"
                      onSubmit={(e) => e.preventDefault()}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-white/70 mb-2">
                            Name
                          </label>
                          <input
                            type="text"
                            placeholder="Your name"
                            className="w-full rounded-2xl bg-black/40 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/35"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-white/70 mb-2">
                            Email
                          </label>
                          <input
                            type="email"
                            placeholder="you@company.com"
                            className="w-full rounded-2xl bg-black/40 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/35"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm text-white/70 mb-2">
                          Message
                        </label>
                        <textarea
                          rows={5}
                          placeholder="Goals, timeline, and what you need help with…"
                          className="w-full rounded-2xl bg-black/40 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/35 resize-none"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90 transition"
                        >
                          Send enquiry
                        </button>

                        <a
                          href="mailto:nelly@guestlistsocial.com?subject=Guestlist%20Social%20Enquiry"
                          className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 text-white hover:border-white/60 transition"
                        >
                          Or email directly
                        </a>
                      </div>

                      <p className="text-xs text-white/55 pt-1">
                        Prefer WhatsApp? Use the phone number and we’ll respond ASAP.
                      </p>
                    </form>

                    <div className="mt-8 flex items-center justify-between text-xs text-white/50">
                      <span>Response time: typically within 24–48 hrs</span>
                      <span className="rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1">
                        Executive finish
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 bg-black/80 backdrop-blur-[2px] py-10 px-6 text-sm text-white/50">
          <div className="max-w-6xl mx-auto">
            © {new Date().getFullYear()} Guestlist Social. All rights reserved.
          </div>
        </footer>
      </div>
    </main>
  );
}