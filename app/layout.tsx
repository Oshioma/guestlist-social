import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guestlist Social — Strategy, Content & Community",
  description:
    "We combine strategy, creative and community to build brands people actually engage with. Corporate delivery. Island execution.",
  openGraph: {
    title: "Guestlist Social — Strategy, Content & Community",
    description:
      "We combine strategy, creative and community to build brands people actually engage with.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
