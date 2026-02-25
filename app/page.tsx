import Image from "next/image";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">

      {/* Background Gradients */}
      <div className="absolute inset-0 -z-10">
        {/* Top gradient */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] opacity-60 blur-3xl">
          <Image
            src="/gradient-1.png"
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Bottom gradient */}
        <div className="absolute bottom-[-200px] right-[-200px] w-[900px] h-[700px] opacity-50 blur-3xl">
          <Image
            src="/gradient-2.png"
            alt=""
            fill
            className="object-cover"
          />
        </div>

        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.12]">
          <Image
            src="/pattern.png"
            alt=""
            fill
            className="object-cover"
          />
        </div>

        {/* Dark gradient overlay for contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />
      </div>

      {/* Navigation */}
      <header className="relative z-10 px-6 py-6 max-w-6xl mx-auto flex items-center justify-between">
        <div className="text-lg font-semibold tracking-tight">
          Guestlist Social
        </div>
        <a
          href="#contact"
          className="bg-white text-black px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition"
        >
          Book a Call
        </a>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-24 grid md:grid-cols-2 gap-12 items-center">
        
        {/* Left Content */}
        <div>
          <h1 className="text-5xl md:text-7xl font-semibold leading-tight tracking-tight">
            Content that feels premium — and converts.
          </h1>

          <p className="mt-6 text-lg text-white/70 max-w-xl">
            We build short-form content systems for brands that want
            high-quality visuals and measurable growth.
          </p>

          <div className="mt-8 flex gap-4">
            <a
              href="#contact"
              className="bg-white text-black px-6 py-3 rounded-full font-medium hover:opacity-90 transition"
            >
              Get Started
            </a>
            <a
              href="#services"
              className="border border-white/20 px-6 py-3 rounded-full text-white hover:border-white/40 transition"
            >
              View Services
            </a>
          </div>
        </div>

        {/* Right Hero Card */}
        <div className="relative rounded-3xl overflow-hidden bg-white/5 border border-white/10">
          <div className="absolute inset-0">
            <Image
              src="/hero-grain.jpg"
              alt="Premium texture"
              fill
              className="object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
          </div>

          <div className="relative p-8">
            <div className="text-sm text-white/70">
              Weekly Content Engine
            </div>
            <h3 className="mt-3 text-2xl font-semibold">
              Structured. Consistent. Scalable.
            </h3>

            <ul className="mt-6 space-y-3 text-white/70 text-sm">
              <li>• Hook scripting & content planning</li>
              <li>• Premium editing & pacing</li>
              <li>• Caption + publishing workflow</li>
              <li>• Monthly growth review</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Services */}
      <section
        id="services"
        className="relative z-10 border-t border-white/10 py-20 px-6"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-semibold tracking-tight">
            Services
          </h2>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Content Strategy",
                desc: "Clear positioning, hooks, and posting rhythm."
              },
              {
                title: "Production & Editing",
                desc: "Short-form built to feel expensive and intentional."
              },
              {
                title: "Growth Optimization",
                desc: "Testing hooks and scaling what wins."
              }
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl bg-white/5 border border-white/10 p-8 hover:bg-white/[0.08] transition"
              >
                <h3 className="text-lg font-semibold">
                  {item.title}
                </h3>
                <p className="mt-4 text-white/70 text-sm leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section
        id="contact"
        className="relative z-10 border-t border-white/10 py-20 px-6"
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to look premium?
            </h2>
            <p className="mt-4 text-white/70">
              Send your Instagram and offer. We’ll reply with a plan.
            </p>
          </div>

          <a
            href="mailto:hello@guestlistsocial.com"
            className="bg-white text-black px-6 py-3 rounded-full font-medium hover:opacity-90 transition"
          >
            Email Us
          </a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 py-8 px-6 text-sm text-white/50">
        <div className="max-w-6xl mx-auto">
          © {new Date().getFullYear()} Guestlist Social
        </div>
      </footer>
    </main>
  );
}