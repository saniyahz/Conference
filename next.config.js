/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Disable caching to force fresh builds
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
}

module.exports = nextConfig
