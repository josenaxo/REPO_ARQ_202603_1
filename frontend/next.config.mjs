/** @type {import('next').NextConfig} */
// Con NEXT_OUTPUT=export se genera el sitio estático para S3 + CloudFront (infra/frontend).
// Sin esa variable (npm run dev) la configuración es la de siempre.
const exportar = process.env.NEXT_OUTPUT === 'export'

const nextConfig = {
  images: {
    domains: ['localhost', 'lh3.googleusercontent.com'],
    formats: ['image/webp'],
    ...(exportar && { unoptimized: true }), // la optimización de imágenes necesita servidor
  },
  experimental: {
    optimizeCss: true,
    ...(exportar && { missingSuspenseWithCSRBailout: false }),
  },
  ...(exportar && { output: 'export', trailingSlash: true }),
}

export default nextConfig
