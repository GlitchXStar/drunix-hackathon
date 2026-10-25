process.env.NEXT_IGNORE_INCORRECT_LOCKFILE = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Disable Webpack 5 filesystem packfile caching in dev on Windows.
      // This prevents ENOENT rename errors, ModuleWarning serialization failures,
      // and missing layout.css / main-app.js chunk 404 errors on browser reload.
      config.cache = false;
    }
    return config;
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
