/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@urganize/ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
