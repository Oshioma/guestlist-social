"use client";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen bg-black text-white overflow-hidden">
      {/* ===== Animations (no deps) ===== */}
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

      {/* ===== FIXED BACKGROUND (FULL IMAGE, NEVER CROPS) ===== */}
      <div aria-hidden className="fixed inset-0 z-0 bg-black">
        {/* IMPORTANT: force full viewport sizing + contain */}
        <img
          src="/hero-island.jpg"
          alt=""
          className="h-screen w-screen object-contain object-center pointer-events-none select-none"
        />

        {/* Overlay (keeps text readable, does NOT affect cropping) */}
        <div className="absolute inset-0 bg-black/55" />

        {/* Texture (optional) */}
        <div className="absolute inset-0 opacity-[0.12]">
          <img
            src="/texture-water.jpg"
            alt=""
            className="h-full w-full object-cover pointer-events-none select-none"
          />
        </div>

        {/* Keep fades light so they don't “hide” edges */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      {/* ===== CONTENT ===== */}
      <div className="relative z-10">
        {/* Header */}
        <header className="px-6 py-6 max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">Guestlist Social</div>

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
              We create meaningful engagement between brands and audiences, building real
              attention with content that connects.
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
            <div className="relative rounded-3xl overflow-hidden bg-white/10 ring-1 ring-white/15 backdrop-blur-[4px]">
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
                <h3 className="mt-3 text-2xl font-semibold">Structured. Consistent. Premium.</h3>

                <ul className="mt-6 space-y-3 text-white/85 text-sm">
                  <li>• Hook scripting & content planning</li>
                  <li>• Premium editing & pacing</li>
                  <li>• Caption + publishing workflow</li>
                  <li>• Monthly growth review</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 rounded-3xl overflow-hidden bg-white/10 ring-1 ring-white/15 backdrop-blur-[4px]">
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
          className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6"
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
          className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6"
        >
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-semibold tracking-tight">Selected Work</h2>
            <p className="mt-4 text-white/70 max-w-2xl">
              We help brands sharpen their presence and build systems that compound. Case studies
              available upon request.
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
          className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6"
        >
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Ready to build something that stops attention?
              </h2>
              <p className="mt-4 text-white/70">
                Typical reply within{" "}
                <span className="text-white/85 font-medium">24–48 hours</span>. Urgent?{" "}
                <span className="text-white/85 font-medium">Call us.</span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="mailto:nelly@guestlistsocial.com"
                className="bg-white text-black px-6 py-3 rounded-full font-medium hover:opacity-90 transition"
              >
                nelly@guestlistsocial.com
              </a>
              <a
                href="tel:07537142056"
                className="rounded-full border border-white/25 px-6 py-3 text-white hover:border-white/60 transition"
              >
                07537 142 056
              </a>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-10 px-6 text-sm text-white/50">
          <div className="max-w-6xl mx-auto">
            © {new Date().getFullYear()} Guestlist Social. All rights reserved.
          </div>
        </footer>
      </div>
    </main>
  );
}