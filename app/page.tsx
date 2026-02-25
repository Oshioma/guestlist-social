import Image from "next/image";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">
      {/* BACKGROUND LAYERS */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Island hero base */}
        <div className="absolute inset-0">
          <Image
            src="/hero-island.jpg"
            alt=""
            fill
            priority
            className="object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/75 to-black" />
        </div>

        {/* Brand gradients (visible but tasteful) */}
        <div className="absolute -top-44 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 blur-3xl opacity-55">
          <Image src="/gradient-1.png" alt="" fill className="object-cover" />
        </div>
        <div className="absolute -bottom-56 right-[-220px] h-[720px] w-[900px] blur-3xl opacity-45">
          <Image src="/gradient-2.png" alt="" fill className="object-cover" />
        </div>

        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-[0.10] mix-blend-overlay">
          <Image src="/pattern.png" alt="" fill className="object-cover" />
        </div>

        {/* Water texture overlay */}
        <div className="absolute inset-0 opacity-[0.18] mix-blend-overlay">
          <Image src="/texture-water.jpg" alt="" fill className="object-cover" />
        </div>
      </div>

      {/* HEADER */}
      <header className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
              <span className="text-sm font-semibold tracking-tight">GS</span>
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Guestlist Social</div>
              <div className="text-xs text-white/60">
                We build brands that don’t scroll.
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm text-white/70">
            <a className="hover:text-white" href="#services">Services</a>
            <a className="hover:text-white" href="#work">Work</a>
            <a className="hover:text-white" href="#contact">Contact</a>
          </nav>

          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-full bg-white text-black px-5 py-2.5 text-sm font-medium hover:opacity-90"
          >
            Work With Us
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 pt-12 pb-10 md:pt-20 md:pb-16 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 text-xs text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
              Corporate delivery. Island execution.
            </div>

            <h1 className="mt-6 text-5xl md:text-7xl font-semibold leading-[1.03] tracking-tight">
              We build brands that don’t scroll.
              <span className="text-white/55"> They stop attention.</span>
            </h1>

            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl">
              We plan, shoot, edit, and publish high-performing content for brands
              that want growth without the chaos.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <a
                href="#contact"
                className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90"
              >
                Work With Us
              </a>
              <a
                href="#work"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-white/90 hover:border-white/30"
              >
                See Work
              </a>
            </div>

            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["12–48h", "Turnaround"],
                ["3–8", "Reels / week"],
                ["2×", "Hook testing cadence"],
                ["Monthly", "Reporting"],
              ].map(([k, v]) => (
                <div key={v} className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-4">
                  <div className="text-sm font-semibold">{k}</div>
                  <div className="mt-1 text-xs text-white/60">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT CARD */}
          <div className="md:col-span-5">
            <div className="relative rounded-3xl overflow-hidden bg-white/5 ring-1 ring-white/10">
              <div className="absolute inset-0">
                <Image
                  src="/hero-grain.jpg"
                  alt=""
                  fill
                  className="object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
              </div>

              <div className="relative p-6 md:p-8">
                <div className="text-sm text-white/70">What you get</div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">
                  A weekly content system
                </div>
                <ul className="mt-5 space-y-3 text-sm text-white/70">
                  {[
                    "Hook scripting + shot list",
                    "Editing that matches premium brands",
                    "Captions + posting schedule",
                    "Monthly performance review",
                  ].map((x) => (
                    <li key={x} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-white/70" />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Proof image */}
            <div className="mt-4 rounded-3xl overflow-hidden ring-1 ring-white/10 bg-white/5">
              <div className="relative h-44">
                <Image
                  src="/proof-meeting.jpg"
                  alt="Team reviewing performance"
                  fill
                  className="object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/10" />
              </div>
              <div className="p-5">
                <div className="text-xs text-white/60">Executive standard</div>
                <div className="mt-1 text-sm text-white/80">
                  Strategy, production, and delivery with a boardroom-level finish.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-16 border-t border-white/10">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Services</h2>
          <p className="mt-2 text-white/65 max-w-2xl">
            A small menu, done properly. No fluff — just the pieces that move growth.
          </p>

          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {[
              ["Strategy", "Positioning, content pillars, and posting plan that fits your brand."],
              ["Content Production", "Short-form video, photography, editing, hooks, captions."],
              ["Growth + Ads", "Testing, reporting, and paid boosts for winners."],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-7 hover:bg-white/[0.07] transition">
                <div className="text-sm text-white/60">Service</div>
                <div className="mt-2 text-lg font-semibold">{title}</div>
                <p className="mt-3 text-sm text-white/70 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORK */}
      <section id="work" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-16 border-t border-white/10">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Selected work</h2>
          <p className="mt-2 text-white/70 max-w-2xl">
            Add your case studies here. For now these are placeholders.
          </p>

          <div className="mt-8 grid md:grid-cols-3 gap-4">
            {["Brand Launch", "Content System", "Paid Social"].map((x) => (
              <div key={x} className="rounded-3xl border border-white/10 p-6 bg-white/5">
                <div className="text-white/80 text-sm">Case Study</div>
                <div className="mt-2 font-medium">{x}</div>
                <div className="mt-4 h-32 rounded-xl bg-black/30 border border-white/10" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-16 border-t border-white/10">
          <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Contact</h2>
              <p className="mt-2 text-white/70">
                Add your email/Calendly link here.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <a
                className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90"
                href="mailto:hello@guestlistsocial.com"
              >
                Email us
              </a>
              <a
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-white/90 hover:border-white/30"
                href="#"
              >
                Book via Calendly
              </a>
            </div>
          </div>

          <footer className="mt-10 text-sm text-white/45">
            © {new Date().getFullYear()} Guestlist Social. All rights reserved.
          </footer>
        </div>
      </section>
    </main>
  );
}