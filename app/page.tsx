"use client";

import { useEffect, useRef, useState } from "react";

/* ── Scroll-reveal hook ─────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".sr");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("sr-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Home() {
  useScrollReveal();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [formState, setFormState] = useState({ name: "", brand: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { name, brand, message } = formState;
    const subject = encodeURIComponent(`New enquiry from ${name} — ${brand}`);
    const body = encodeURIComponent(
      `Name: ${name}\nBrand: ${brand}\n\nMessage:\n${message}`
    );
    window.location.href = `mailto:nelly@guestlistsocial.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  return (
    <main className="relative isolate min-h-screen bg-black text-white overflow-x-hidden">
      {/* ── Styles ──────────────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes gl-fade-up {
          from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
          to   { opacity: 1; transform: translateY(0);    filter: blur(0);   }
        }
        @keyframes gl-float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-10px); }
        }
        .gl-animate-in               { animation: gl-fade-up 700ms cubic-bezier(0.2,0.8,0.2,1) both; }
        .gl-animate-in-delay-1       { animation-delay: 120ms; }
        .gl-animate-in-delay-2       { animation-delay: 240ms; }
        .gl-animate-in-delay-3       { animation-delay: 360ms; }
        .gl-animate-in-delay-4       { animation-delay: 480ms; }
        .gl-float                    { animation: gl-float 6s ease-in-out infinite; }

        /* Scroll-reveal */
        .sr {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.65s ease, transform 0.65s ease;
        }
        .sr-visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>

      {/* ── Fixed background ────────────────────────────────────── */}
      <div aria-hidden className="fixed inset-0 z-0 bg-black">
        <img
          src="/hero-island.jpg"
          alt=""
          className="h-full w-full object-contain object-center pointer-events-none select-none"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 opacity-[0.12]">
          <img src="/texture-water.jpg" alt="" className="h-full w-full object-cover pointer-events-none select-none" />
        </div>
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="relative z-10">

        {/* ── Sticky header ───────────────────────────────────────── */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-md">
          <div className="px-6 py-4 max-w-6xl mx-auto flex items-center justify-between">
            <div className="text-lg font-semibold tracking-tight">Guestlist Social</div>

            {/* Desktop nav */}
            <nav className="hidden md:flex gap-8 text-sm text-white/85">
              <a href="#services" className="hover:text-white transition-colors">Services</a>
              <a href="#process"  className="hover:text-white transition-colors">Process</a>
              <a href="#work"     className="hover:text-white transition-colors">Work</a>
              <a href="#contact"  className="hover:text-white transition-colors">Contact</a>
            </nav>

            <div className="flex items-center gap-3">
              <a
                href="#contact"
                className="hidden md:inline-flex bg-white text-black px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition"
              >
                Work With Us
              </a>

              {/* Hamburger */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
                className="md:hidden flex flex-col gap-1.5 p-2"
              >
                <span className={`block h-0.5 w-6 bg-white transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
                <span className={`block h-0.5 w-6 bg-white transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`} />
                <span className={`block h-0.5 w-6 bg-white transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileOpen && (
            <nav className="md:hidden border-t border-white/10 bg-black/90 px-6 py-4 flex flex-col gap-4 text-sm">
              <a href="#services" onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">Services</a>
              <a href="#process"  onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">Process</a>
              <a href="#work"     onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">Work</a>
              <a href="#contact"  onClick={() => setMobileOpen(false)} className="text-white/80 hover:text-white">Contact</a>
              <a
                href="#contact"
                onClick={() => setMobileOpen(false)}
                className="mt-2 inline-flex justify-center bg-white text-black px-5 py-2.5 rounded-full text-sm font-medium"
              >
                Work With Us
              </a>
            </nav>
          )}
        </header>

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-6 pt-20 pb-24 md:pt-32 md:pb-32">
          <div className="gl-animate-in">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-xs text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
              Corporate delivery. Island execution.
            </div>

            <h1 className="mt-6 text-5xl md:text-7xl font-semibold leading-[1.03] tracking-tight">
              We build brands that don't scroll.
              <span className="text-white/75"> They stop attention.</span>
            </h1>

            <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl gl-animate-in gl-animate-in-delay-1">
              We create meaningful engagement between brands and audiences, building real
              attention with content that connects.
            </p>

            <p className="mt-3 text-xl md:text-2xl text-emerald-300/80 font-medium gl-animate-in gl-animate-in-delay-2">
              We like clients whom do good things.
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
        </section>

        {/* ── Services ────────────────────────────────────────────── */}
        <section id="services" className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="sr text-3xl font-semibold tracking-tight">What We Do</h2>
            <p className="sr mt-4 text-white/70 max-w-2xl text-lg leading-relaxed">
              We combine strategy, creative and community to build brands people actually engage with.
            </p>

            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="sr rounded-3xl bg-white/5 border border-white/10 p-8">
                <h3 className="text-lg font-semibold">Strategy</h3>
                <p className="mt-4 text-white/70 text-sm leading-relaxed">
                  We define how your brand shows up with a clear plan of action. Following a thorough
                  consultation, we plan positioning, content direction and platform strategy to create
                  clarity, consistency and growth.
                </p>
              </div>

              <div className="sr rounded-3xl bg-white/5 border border-white/10 p-8" style={{transitionDelay:"80ms"}}>
                <h3 className="text-lg font-semibold">Content</h3>
                <p className="mt-4 text-white/70 text-sm leading-relaxed">
                  Content that earns attention, not just fills a feed. We concept, plan and produce
                  high-performing content designed to stop scroll and spark engagement including video
                  and design.
                </p>
              </div>

              <div className="sr rounded-3xl bg-white/5 border border-white/10 p-8" style={{transitionDelay:"160ms"}}>
                <h3 className="text-lg font-semibold">Being Social</h3>
                <p className="mt-4 text-white/70 text-sm leading-relaxed">
                  Growth doesn't happen without conversation. We manage your presence, engage your
                  audience, turn attention into loyalty and expand your reach sparking conversations
                  outside your current community.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Process ─────────────────────────────────────────────── */}
        <section id="process" className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="sr text-3xl font-semibold tracking-tight">How It Works</h2>
            <p className="sr mt-4 text-white/70 max-w-2xl">
              Three steps from conversation to compounding results.
            </p>

            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {[
                {
                  step: "01",
                  title: "Discovery",
                  desc: "We start with a deep-dive consultation — your brand, your audience, your goals. No templates. We build the strategy around you.",
                  delay: "0ms",
                },
                {
                  step: "02",
                  title: "Strategy & Build",
                  desc: "We define your positioning, content pillars and publishing cadence, then build the creative system designed to perform week after week.",
                  delay: "80ms",
                },
                {
                  step: "03",
                  title: "Execute & Grow",
                  desc: "We produce, publish and manage. Monthly reviews test and refine what's working, compounding results over time.",
                  delay: "160ms",
                },
              ].map(({ step, title, desc, delay }) => (
                <div
                  key={step}
                  className="sr rounded-3xl bg-white/5 border border-white/10 p-8 relative"
                  style={{ transitionDelay: delay }}
                >
                  <div className="text-5xl font-bold text-white/10 leading-none">{step}</div>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-3 text-white/70 text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Work / Case Studies ─────────────────────────────────── */}
        <section id="work" className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="sr text-3xl font-semibold tracking-tight">Selected Work</h2>
            <p className="sr mt-4 text-white/70 max-w-2xl">
              We help brands sharpen their presence and build systems that compound.
            </p>

            {/* Video examples */}
            <div className="mt-12 grid grid-cols-3 gap-4 md:gap-6">
              {[
                "FgIEQINuoyc",
                "vfj0Q-b31_M",
                "-Z3W6igzIsI",
              ].map((id, i) => (
                <div
                  key={id}
                  className="sr rounded-2xl overflow-hidden aspect-[9/16] bg-black"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <iframe
                    src={`https://www.youtube.com/embed/${id}`}
                    title={`Content example ${i + 1}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              ))}
            </div>

            <div className="mt-16 grid md:grid-cols-3 gap-6">
              {/* Case Study 1 */}
              <div className="sr rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col">
                <div className="text-xs text-white/50 uppercase tracking-widest">Case Study 01</div>
                <h3 className="mt-3 text-lg font-semibold leading-snug">
                  Luxury Hospitality Brand — Short-Form Content System
                </h3>
                <p className="mt-4 text-sm text-white/60 leading-relaxed">
                  High-end boutique hospitality brand struggling with inconsistent posting and low
                  engagement despite premium positioning.
                </p>
                <div className="mt-6">
                  <div className="text-xs text-white/50 uppercase tracking-widest mb-3">What We Did</div>
                  <ul className="space-y-2 text-sm text-white/75">
                    <li>• Built a weekly short-form content engine (3–5 reels/week)</li>
                    <li>• Scripted hooks aligned with booking intent</li>
                    <li>• Repositioned visuals from aesthetic to aspirational experience</li>
                    <li>• Structured caption strategy tied to direct booking links</li>
                  </ul>
                </div>
                <div className="mt-6 rounded-2xl bg-black/30 border border-white/10 p-5 space-y-3">
                  <div className="text-xs text-white/50 uppercase tracking-widest mb-1">Result — 90 Days</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">+42%</span>
                    <span className="text-sm text-white/65">profile engagement</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">3.1×</span>
                    <span className="text-sm text-white/65">reel reach</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">+28%</span>
                    <span className="text-sm text-white/65">direct booking inquiries</span>
                  </div>
                </div>
                <p className="mt-5 text-xs text-white/50 italic">
                  Consistency + structured hooks outperformed ad spend alone.
                </p>
              </div>

              {/* Case Study 2 */}
              <div className="sr rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col" style={{transitionDelay:"80ms"}}>
                <div className="text-xs text-white/50 uppercase tracking-widest">Case Study 02</div>
                <h3 className="mt-3 text-lg font-semibold leading-snug">
                  Service Business — Lead Flow Rebuild
                </h3>
                <p className="mt-4 text-sm text-white/60 leading-relaxed">
                  Founder-led service brand relying entirely on referrals. No consistent inbound pipeline.
                </p>
                <div className="mt-6">
                  <div className="text-xs text-white/50 uppercase tracking-widest mb-3">What We Did</div>
                  <ul className="space-y-2 text-sm text-white/75">
                    <li>• Defined brand positioning & messaging clarity</li>
                    <li>• Created educational authority-style short-form content</li>
                    <li>• Implemented monthly performance review + hook testing</li>
                    <li>• Layered paid amplification on top 20% performing posts</li>
                  </ul>
                </div>
                <div className="mt-6 rounded-2xl bg-black/30 border border-white/10 p-5 space-y-3">
                  <div className="text-xs text-white/50 uppercase tracking-widest mb-1">Result — 120 Days</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">64</span>
                    <span className="text-sm text-white/65">qualified inbound leads</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">−37%</span>
                    <span className="text-sm text-white/65">cost per lead</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">5</span>
                    <span className="text-sm text-white/65">new retainer clients closed</span>
                  </div>
                </div>
                <p className="mt-5 text-xs text-white/50 italic">
                  Clear positioning converts faster than high volume posting.
                </p>
              </div>

              {/* Case Study 3 */}
              <div className="sr rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col" style={{transitionDelay:"160ms"}}>
                <div className="text-xs text-white/50 uppercase tracking-widest">Case Study 03</div>
                <h3 className="mt-3 text-lg font-semibold leading-snug">
                  Personal Brand → Authority Positioning
                </h3>
                <p className="mt-4 text-sm text-white/60 leading-relaxed">
                  Founder had strong knowledge but weak digital authority and inconsistent posting.
                </p>
                <div className="mt-6">
                  <div className="text-xs text-white/50 uppercase tracking-widest mb-3">What We Did</div>
                  <ul className="space-y-2 text-sm text-white/75">
                    <li>• Built a structured weekly publishing calendar</li>
                    <li>• Designed repeatable video format system</li>
                    <li>• Refined visual identity for premium perception</li>
                    <li>• Integrated growth testing cycles</li>
                  </ul>
                </div>
                <div className="mt-6 rounded-2xl bg-black/30 border border-white/10 p-5 space-y-3">
                  <div className="text-xs text-white/50 uppercase tracking-widest mb-1">Result — 6 Months</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">2.4×</span>
                    <span className="text-sm text-white/65">follower growth</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">+187%</span>
                    <span className="text-sm text-white/65">avg engagement rate</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-white">3</span>
                    <span className="text-sm text-white/65">high-ticket partnership deals</span>
                  </div>
                </div>
                <p className="mt-5 text-xs text-white/50 italic">
                  Structured repetition builds authority faster than viral chasing.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Testimonials ────────────────────────────────────────── */}
        <section className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  quote: "Really enjoyed working with this team! They were super friendly, easy to communicate with, and made the whole process smooth from start to finish. Always great collaborating with people who are both professional and genuinely nice to work with.",
                  author: "Mama Buci",
                  delay: "0ms",
                },
                {
                  quote: "We've had a good experience working with them. They understood our brand and handle things professionally.",
                  author: "Cirio",
                  delay: "60ms",
                },
                {
                  quote: "The service you provided is second to none! The organisation and consistency in the messages you post are brilliant, and the competitions and other activities were great.",
                  author: "BagelFactory UK",
                  delay: "120ms",
                },
                {
                  quote: "Guestlist have run our social media accounts for over 2 years and made my life really easy and just got on with the tasks in hand. They done a great job of increasing our brand exposure and I've recommended them to a number of clients that are now using their services.",
                  author: "Wrappz Skins",
                  delay: "0ms",
                },
                {
                  quote: "I've been really pleased with the posts. I think they've really helped us triple our takings over the last 4 weeks!",
                  author: "Flaming Licks",
                  delay: "60ms",
                },
                {
                  quote: "I was sceptical about how effective this would actually be — happy to say they proved me wrong! Very friendly and thoughtful team who took the time to understand my business and what I wanted...",
                  author: "AerosoulLimited",
                  delay: "120ms",
                },
              ].map(({ quote, author, delay }) => (
                <div
                  key={author}
                  className="sr rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col gap-6"
                  style={{ transitionDelay: delay }}
                >
                  <p className="text-white/80 text-sm leading-relaxed">"{quote}"</p>
                  <p className="text-xs text-white/45 mt-auto font-medium">— {author}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact ─────────────────────────────────────────────── */}
        <section id="contact" className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-20 px-6">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 items-start">
            <div className="sr">
              <h2 className="text-3xl font-semibold tracking-tight">
                Ready to build something that stops attention?
              </h2>
              <p className="mt-4 text-white/70 leading-relaxed">
                We work with brands and founders whom do good things. If that sounds like
                you, we'd love to hear about what you're building.
              </p>
              <p className="mt-6 text-sm text-white/50">
                Typical reply within <span className="text-white/75 font-medium">24–48 hours</span>.
                Urgent? <span className="text-white/75 font-medium">Call us.</span>
              </p>
              <div className="mt-8 flex flex-col gap-3">
                <a
                  href="mailto:nelly@guestlistsocial.com"
                  className="text-sm text-white/70 hover:text-white transition-colors"
                >
                  nelly@guestlistsocial.com
                </a>
                <a
                  href="tel:07537142056"
                  className="text-sm text-white/70 hover:text-white transition-colors"
                >
                  07537 142 056
                </a>
              </div>
            </div>

            {/* Contact form */}
            <div className="sr" style={{transitionDelay:"100ms"}}>
              {submitted ? (
                <div className="rounded-3xl bg-white/5 border border-white/10 p-8 text-center">
                  <div className="text-2xl font-semibold">Thank you</div>
                  <p className="mt-3 text-white/65 text-sm">
                    Your message is on its way. We'll be in touch shortly.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="rounded-3xl bg-white/5 border border-white/10 p-8 flex flex-col gap-5"
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/50 uppercase tracking-widest">Your Name</label>
                    <input
                      type="text"
                      required
                      value={formState.name}
                      onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                      className="rounded-xl bg-white/8 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                      placeholder="Jane Smith"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/50 uppercase tracking-widest">Your Brand / Business</label>
                    <input
                      type="text"
                      required
                      value={formState.brand}
                      onChange={(e) => setFormState({ ...formState, brand: e.target.value })}
                      className="rounded-xl bg-white/8 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                      placeholder="Acme Co."
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/50 uppercase tracking-widest">What do you need?</label>
                    <textarea
                      required
                      rows={4}
                      value={formState.message}
                      onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                      className="rounded-xl bg-white/8 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
                      placeholder="Tell us a bit about your brand and what you're looking to achieve…"
                    />
                  </div>

                  <button
                    type="submit"
                    className="mt-2 rounded-full bg-white text-black px-6 py-3 text-sm font-medium hover:opacity-90 transition"
                  >
                    Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="border-t border-white/10 bg-black/80 backdrop-blur-[4px] py-10 px-6 text-sm text-white/50">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="font-semibold text-white/70 tracking-tight">Guestlist Social</div>

            <nav className="flex gap-6 text-xs">
              <a href="#services" className="hover:text-white/80 transition-colors">Services</a>
              <a href="#process"  className="hover:text-white/80 transition-colors">Process</a>
              <a href="#work"     className="hover:text-white/80 transition-colors">Work</a>
              <a href="#contact"  className="hover:text-white/80 transition-colors">Contact</a>
            </nav>

            <div className="text-xs text-center md:text-right">
              © {new Date().getFullYear()} Guestlist Social. All rights reserved.
            </div>
          </div>
        </footer>

      </div>
    </main>
  );
}
