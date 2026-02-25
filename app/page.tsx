import Image from "next/image";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HERO BACKGROUND ===== */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/hero-island.jpg"
          alt="Island aerial"
          fill
          priority
          className="object-cover"
        />
        {/* Soft dark overlay for readability */}
        <div className="absolute inset-0 bg-black/55" />
      </div>

      {/* ===== HEADER ===== */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">
            Guestlist Social
          </div>

          <nav className="hidden md:flex gap-8 text-sm text-white/80">
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
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-32">
        <div className="max-w-3xl">
          <h1 className="text-5xl md:text-7xl font-semibold leading-tight tracking-tight">
            We build brands that don’t scroll.
            <span className="text-white/70"> They stop attention.</span>
          </h1>

          <p className="mt-8 text-lg md:text-xl text-white/80">
            We plan, shoot, edit, and publish high-performing content for brands
            that want growth without the chaos.
          </p>

          <div className="mt-10 flex gap-4">
            <a
              href="#contact"
              className="bg-white text-black px-6 py-3 rounded-full font-medium hover:opacity-90 transition"
            >
              Start a Conversation
            </a>

            <a
              href="#services"
              className="border border-white/30 px-6 py-3 rounded-full text-white hover:border-white transition"
            >
              View Services
            </a>
          </div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <section id="services" className="relative z-10 bg-black py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-semibold tracking-tight">
            What We Do
          </h2>

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
                className="rounded-3xl bg-white/5 border border-white/15 p-8"
              >
                <h3 className="text-lg font-semibold">
                  {service.title}
                </h3>
                <p className="mt-4 text-white/70 text-sm leading-relaxed">
                  {service.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WORK ===== */}
      <section id="work" className="relative z-10 bg-black py-24 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-semibold tracking-tight">
            Selected Work
          </h2>

          <p className="mt-4 text-white/70 max-w-2xl">
            We help brands sharpen their presence and build systems that compound.
          </p>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {["Brand Launch", "Content System", "Growth Execution"].map((item) => (
              <div
                key={item}
                className="rounded-3xl bg-white/5 border border-white/15 overflow-hidden"
              >
                <div className="relative h-40">
                  <Image
                    src="/proof-meeting.jpg"
                    alt="Case preview"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-6">
                  <div className="text-sm text-white/60">Case Study</div>
                  <div className="mt-2 text-lg font-semibold">
                    {item}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CONTACT ===== */}
      <section id="contact" className="relative z-10 bg-black py-24 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to build something that stops attention?
            </h2>

            <p className="mt-4 text-white/70">
              Tell us about your brand and your goals. We’ll reply with clarity.
            </p>
          </div>

          <a
            href="mailto:hello@guestlistsocial.com"
            className="bg-white text-black px-6 py-3 rounded-full font-medium hover:opacity-90 transition"
          >
            hello@guestlistsocial.com
          </a>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 bg-black py-10 px-6 text-sm text-white/50 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          © {new Date().getFullYear()} Guestlist Social. All rights reserved.
        </div>
      </footer>

    </main>
  );
}