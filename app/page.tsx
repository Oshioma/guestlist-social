import Image from "next/image";

const stats = [
  { k: "12–48h", v: "Turnaround" },
  { k: "3–8", v: "Reels / week" },
  { k: "2×", v: "Hook testing cadence" },
  { k: "Monthly", v: "Reporting" },
];

const services = [
  {
    title: "Content Engine",
    desc: "Weekly shoot plan + editing pipeline. We turn your brand into a predictable stream of high-performing short-form.",
  },
  {
    title: "Creative Direction",
    desc: "Hooks, story arcs, and visuals that feel premium—without losing conversion intent.",
  },
  {
    title: "Growth + Boosts",
    desc: "Test, measure, and scale winners. Lightweight paid boosts where it actually makes sense.",
  },
];

const process = [
  { step: "01", title: "Audit", desc: "We review your offers, content, and audience—then define pillars + angles." },
  { step: "02", title: "Produce", desc: "We script hooks, plan shoots, and build a repeatable weekly delivery cycle." },
  { step: "03", title: "Ship + Learn", desc: "Publish, iterate, and compound. Winners get refined and scaled." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-white/20">
      {/* Background layers */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[520px] w-[980px] -translate-x-1/2 blur-3xl opacity-40">
          <Image
            src="/gradient-1.png"
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="absolute -bottom-32 right-[-120px] h-[520px] w-[720px] blur-3xl opacity-35">
          <Image src="/gradient-2.png" alt="" fill className="object-cover" />
        </div>
        <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay">
          <Image src="/pattern.png" alt="" fill className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black to-black" />
      </div>

      {/* Nav */}
      <header className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
              <span className="text-sm font-semibold">G</span>
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Guestlist Social</div>
              <div className="text-xs text-white/55">Premium content + growth</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm text-white/70">
            <a className="hover:text-white" href="#services">Services</a>
            <a className="hover:text-white" href="#proof">Proof</a>
            <a className="hover:text-white" href="#process">Process</a>
            <a className="hover:text-white" href="#contact">Contact</a>
          </nav>

          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-full bg-white text-black px-5 py-2.5 text-sm font-medium hover:opacity-90"
          >
            Book a call
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 pt-12 pb-10 md:pt-20 md:pb-14 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 ring-1 ring-white/10 px-3 py-1 text-xs text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
              Built for brands that want premium + performance
            </div>

            <h1 className="mt-6 text-5xl md:text-7xl font-semibold leading-[1.03] tracking-tight">
              Content that feels
              <span className="text-white/55"> expensive</span> —
              and sells.
            </h1>

            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl">
              We plan, produce, edit, and publish short-form content that earns attention and converts.
              Simple process. High standards. Compounding growth.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <a
                href="#contact"
                className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90"
              >
                Get a quote
              </a>
              <a
                href="#proof"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-white/90 hover:border-white/30"
              >
                See proof
              </a>
            </div>

            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.map((s) => (
                <div key={s.v} className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-4">
                  <div className="text-sm font-semibold">{s.k}</div>
                  <div className="mt-1 text-xs text-white/60">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="relative rounded-3xl overflow-hidden bg-white/5 ring-1 ring-white/10">
              <div className="absolute inset-0">
                <Image
                  src="/hero-grain.jpg"
                  alt="Premium abstract hero texture"
                  fill
                  className="object-cover opacity-90"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />
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

                <div className="mt-8 rounded-2xl bg-black/40 ring-1 ring-white/10 p-4">
                  <div className="text-xs text-white/60">Starting point</div>
                  <div className="mt-1 text-sm">
                    4-week sprint to build your content engine.
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-white/45">
              Tip: swap this image later with your own shoot to make it instantly more “real”.
            </p>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-16 border-t border-white/10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Services</h2>
              <p className="mt-2 text-white/65 max-w-2xl">
                A small menu, done properly. No fluff — just the pieces that move growth.
              </p>
            </div>
          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {services.map((s) => (
              <div key={s.title} className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-7 hover:bg-white/[0.07] transition">
                <div className="text-sm text-white/60">Service</div>
                <div className="mt-2 text-lg font-semibold">{s.title}</div>
                <p className="mt-3 text-sm text-white/70 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proof */}
      <section id="proof" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-16 border-t border-white/10">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Proof</h2>
          <p className="mt-2 text-white/65 max-w-2xl">
            Add 2–3 real case studies here. For now, placeholders that match the layout.
          </p>

          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {[
              { t: "Content system overhaul", d: "From random posting → weekly engine + consistent output." },
              { t: "Premium brand refresh", d: "Visual direction + editing language that feels expensive." },
              { t: "Hook testing + scaling", d: "Rapid iterations to find winners and compound reach." },
            ].map((c) => (
              <div key={c.t} className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-7">
                <div className="text-sm text-white/60">Case Study</div>
                <div className="mt-2 text-lg font-semibold">{c.t}</div>
                <p className="mt-3 text-sm text-white/70">{c.d}</p>
                <div className="mt-6 h-28 rounded-2xl bg-black/30 ring-1 ring-white/10" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="process" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-16 border-t border-white/10">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Process</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {process.map((p) => (
              <div key={p.step} className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-7">
                <div className="text-xs text-white/60">STEP {p.step}</div>
                <div className="mt-2 text-lg font-semibold">{p.title}</div>
                <p className="mt-3 text-sm text-white/70 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-16 border-t border-white/10">
          <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Ready to look premium?</h2>
              <p className="mt-2 text-white/65 max-w-xl">
                Send your Instagram + offer. We’ll reply with a simple plan and a quote.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <a
                href="mailto:hello@guestlistsocial.com"
                className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90"
              >
                Email us
              </a>
              <a
                href="#"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-white/90 hover:border-white/30"
              >
                Book a call
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