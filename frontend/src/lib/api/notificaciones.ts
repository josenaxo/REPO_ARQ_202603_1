import { api } from '@/lib/api-client'

// Una funcion por ruta de contracts/api/notificaciones.yaml

// ── Lo que responde el backend (contrato, en español) ──
export interface Notificacion {
  id:        string
  usuarioId: string
  tipo:      'PostulacionCreada' | 'HabilidadValidada'
  titulo:    string
  cuerpo:    string
  enlace?:   string
  leida:     boolean
  creadaEn:  string
}

// ── Forma que ya usan las pantallas de notificaciones ──
export interface NotificacionPantalla {
  id:        string
  type:      string
  title:     string
  body:      string
  isRead:    boolean
  link?:     string
  createdAt: string
}

// cada evento con el icono que ya tienen las pantallas (typeIcon de cada page.tsx)
const tipoEnPantalla: Record<Notificacion['tipo'], string> = {
  PostulacionCreada: 'APPLICATION_STATUS',
  HabilidadValidada: 'SKILL_VALIDATED',
}

// ── Traductor: español del backend → forma de las pantallas ──
export function aNotificacionPantalla(n: Notificacion): NotificacionPantalla {
  return {
    id:        n.id,
    type:      tipoEnPantalla[n.tipo] ?? 'GENERAL',
    title:     n.titulo,
    body:      n.cuerpo,
    isRead:    n.leida,
    link:      n.enlace,
    createdAt: n.creadaEn,
  }
}

export const listarNotificaciones = async () =>
  (await api.get<Notificacion[]>('/notifications')).map(aNotificacionPantalla)

export const marcarLeida = (id: string) =>
  api.patch(`/notifications/${encodeURIComponent(id)}/read`, {})

export const marcarTodasLeidas = () =>
  api.patch('/notifications/read-all', {})

export const eliminarNotificacion = (id: string) =>
  api.delete(`/notifications/${encodeURIComponent(id)}`)
