import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/main-admin/dashboard", destination: "/admin-dashboard", permanent: false },
      { source: "/recovery-admin/dashboard", destination: "/recovery-dashboard", permanent: false },
      { source: "/recovery-executive/dashboard", destination: "/recovery-executive-dashboard", permanent: false },
      { source: "/sales-executives/dashboard", destination: "/sales-dashboard", permanent: false },
      { source: "/team-lead/dashboard", destination: "/team-dashboard", permanent: false },
      { source: "/main-admin/users", destination: "/users", permanent: false },
      { source: "/main-admin/teams", destination: "/teams", permanent: false }
    ];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
