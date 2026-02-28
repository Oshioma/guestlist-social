"use client";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen bg-black text-white overflow-hidden">
      <style jsx global>{`
        @keyframes gl-fade-up {
          from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .gl-animate-in {
          animation: gl-fade-up 700ms cubic-bezier(0.2,0.8,0.2,1) both;
        }
      `}</style>

      {/* FIXED BACKGROUND */}
      <div className="fixed inset-0 z-0 bg-black flex items-center justify-center">
        <img
          src="/hero-island.jpg"
          alt=""
          className="max-h-full max-w-full object-contain"
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="relative z-10">
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

        {/* HERO */}
        <section className="max-w-6xl mx-auto px-6 pt-28 pb-28">
          <h1 className="text-5xl md:text-7xl font-semibold leading-[1.03] tracking-tight">
            We build brands that don’t scroll.
            <span className="text-white/75 block">They stop attention.</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl gl-animate-in">
            We create meaningful engagement between brands and audiences — turning content into connection and visibility into growth.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <a href="#contact" className="rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90">
              Start a Conversation
            </a>
            <a href="#services" className="rounded-full border border-white/30 px-6 py-3 hover:border-white/60">
              View Services
            </a>
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