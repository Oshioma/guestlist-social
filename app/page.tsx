"use client";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen bg-black text-white overflow-hidden">
      {/* ===== Animations ===== */}
      <style jsx global>{`
        @keyframes gl-fade-up {
          from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes gl-float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        .gl-animate-in {
          animation: gl-fade-up 700ms cubic-bezier(0.2,0.8,0.2,1) both;
        }
        .gl-animate-in-delay-1 { animation-delay: 120ms; }
        .gl-animate-in-delay-2 { animation-delay: 240ms; }
        .gl-animate-in-delay-3 { animation-delay: 360ms; }
        .gl-float { animation: gl-float 6s ease-in-out infinite; }
      `}</style>

      {/* ===== FIXED BACKGROUND ===== */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-black flex items-center justify-center"
      >
        <img
          src="/hero-island.jpg"
          alt=""
          className="max-h-full max-w-full object-contain"
        />

        <div className="absolute inset-0 bg-black/55" />

        <div className="absolute inset-0 opacity-[0.12]">
          <img
            src="/texture-water.jpg"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>

        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 to-transparent" />
      </div>

      {/* ===== CONTENT ===== */}
      <div className="relative z-10">
        {/* Header */}
        <header className="px-6 py-6 max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">
            Guestlist Social
          </div>

          <nav className="hidden md:flex gap-8 text-sm text-white/85">
            <a href="#services" className="hover:text-white">Services</a>
            <a href="#work" className="hover:text-white">Work</a>
            <a href="#contact" className="hover:text-white">Contact</a>
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

            {/* UPDATED SUBHEADER */}
            <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl gl-animate-in gl-animate-in-delay-1">
              We create meaningful engagement between brands and audiences,
              building real attention with content that connects.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3 gl-animate-in gl-animate-in-delay-2">
              <a href="#contact" className="rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90">
                Start a Conversation
              </a>
              <a href="#services" className="rounded-full border border-white/30 px-6 py-3 hover:border-white/60">
                View Services
              </a>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/10 ring-1 ring-white/15 backdrop-blur-[4px] p-8">
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
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-10 px-6 text-sm text-white/50">
          <div className="max-w-6xl mx-auto">
            © {new Date().getFullYear()} Guestlist Social. All rights reserved.
          </div>
        </footer>
      </div>
    </main>
  );
}