export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="px-6 py-6 max-w-6xl mx-auto flex items-center justify-between">
        <div className="font-semibold tracking-tight">Guestlist Social</div>
        <nav className="flex gap-6 text-sm text-white/70">
          <a href="#services" className="hover:text-white">Services</a>
          <a href="#work" className="hover:text-white">Work</a>
          <a href="#contact" className="hover:text-white">Contact</a>
        </nav>
      </header>

      <section className="px-6 pt-20 pb-16 max-w-6xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
          Social media that turns
          <span className="text-white/60"> attention </span>
          into customers.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl">
          We plan, shoot, edit, and publish high-performing content for brands that want growth
          without the chaos.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90"
          >
            Book a call
          </a>
          <a
            href="#work"
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-white/90 hover:border-white/40"
          >
            See work
          </a>
        </div>
      </section>

      <section id="services" className="px-6 py-16 max-w-6xl mx-auto border-t border-white/10">
        <h2 className="text-2xl font-semibold">Services</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          {[
            ["Strategy", "Positioning, content pillars, and posting plan that fits your brand."],
            ["Content Production", "Short-form video, photography, editing, hooks, captions."],
            ["Growth + Ads", "Testing, reporting, and paid boosts for winners."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl border border-white/10 p-6 bg-white/5">
              <div className="font-medium">{title}</div>
              <p className="mt-2 text-sm text-white/70">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="work" className="px-6 py-16 max-w-6xl mx-auto border-t border-white/10">
        <h2 className="text-2xl font-semibold">Selected work</h2>
        <p className="mt-2 text-white/70 max-w-2xl">
          Add your case studies here. For now these are placeholders.
        </p>
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          {["Brand Launch", "Content System", "Paid Social"].map((x) => (
            <div key={x} className="rounded-2xl border border-white/10 p-6">
              <div className="text-white/80 text-sm">Case Study</div>
              <div className="mt-2 font-medium">{x}</div>
              <div className="mt-4 h-32 rounded-xl bg-white/5 border border-white/10" />
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="px-6 py-16 max-w-6xl mx-auto border-t border-white/10">
        <h2 className="text-2xl font-semibold">Contact</h2>
        <p className="mt-2 text-white/70">
          Add your email/Calendly link here.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <a
            className="inline-flex items-center justify-center rounded-full bg-white text-black px-6 py-3 font-medium hover:opacity-90"
            href="mailto:hello@guestlistsocial.com"
          >
            Email us
          </a>
          <a
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-white/90 hover:border-white/40"
            href="#"
          >
            Book via Calendly
          </a>
        </div>
      </section>

      <footer className="px-6 py-10 max-w-6xl mx-auto text-sm text-white/50">
        © {new Date().getFullYear()} Guestlist Social. All rights reserved.
      </footer>
    </main>
  );
}