import type { ReactNode } from 'react'

// El export estático (NEXT_OUTPUT=export, infra/frontend) exige generateStaticParams en las
// rutas dinámicas. Se genera una sola página; en npm run dev la ruta funciona igual que antes.
export function generateStaticParams() {
  return [{ userId: '_' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
