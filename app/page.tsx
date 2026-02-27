export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-24">
      <div className="max-w-3xl mx-auto text-center">
        
        <h1 className="text-4xl md:text-5xl font-semibold mb-6">
          Contact
        </h1>

        <p className="text-lg text-neutral-600 mb-12">
          Ready to scale your brand with precision and impact?  
          Let’s build something powerful.
        </p>

        {/* Contact Details */}
        <div className="space-y-6 text-lg">
          
          <div>
            <p className="text-neutral-500 text-sm uppercase tracking-wide">
              Email
            </p>
            <a
              href="mailto:nelly@guestlistsocial.com"
              className="hover:underline"
            >
              nelly@guestlistsocial.com
            </a>
          </div>

          <div>
            <p className="text-neutral-500 text-sm uppercase tracking-wide">
              Phone
            </p>
            <a
              href="tel:07537142056"
              className="hover:underline"
            >
              07537 142 056
            </a>
          </div>

        </div>

      </div>
    </main>
  );
}