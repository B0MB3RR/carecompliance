/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Every page here is a static route rendered client-side (no dynamic
  // segments, server actions, or API routes), so a full static export is
  // both simpler and more reliable on Netlify than the SSR runtime path -
  // it ships as plain HTML/JS/CSS with no serverless cold starts involved.
  output: 'export',
  trailingSlash: true,
};

module.exports = nextConfig;

