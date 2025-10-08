/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Lint hataları build’i durdurmasın
    ignoreDuringBuilds: true,
  },
  typescript: {
    // (İstersen) TS hataları da build’i durdurmasın
    ignoreBuildErrors: true,
  },
};

export default nextConfig; // mjs/ts kullanıyorsan
// module.exports = nextConfig; // js kullanıyorsan