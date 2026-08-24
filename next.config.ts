import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin each browser to the deployment it loaded. Without this, the first
  // deploy after a tab is opened invalidates that tab's server action ids —
  // the next button click posts an action the new deployment has never heard
  // of, and Next recovers by reloading the route, which looks exactly like
  // "I clicked create and came back to an empty form".
  // Requires Skew Protection to be enabled for the project in Vercel; the env
  // var is absent locally, where this is simply inert.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,

  async rewrites() {
    return [
      {
        source: "/app",
        destination: "/admin-panel",
      },
      {
        source: "/app/:path*",
        destination: "/admin-panel/:path*",
      },
    ];
  },
};

export default nextConfig;
