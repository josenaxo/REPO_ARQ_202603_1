// Entidad Notificacion: se crea a partir de un evento de la cola. No conoce AWS ni HTTP.
import { EventoInvalido } from './errores.mjs'

const esTexto = (valor) => typeof valor === 'string' && valor.trim() !== ''

// Qué notificación produce cada evento. Los campos salen de contracts/eventos/*.json.
const PLANTILLAS = {
  // Lo publica postulaciones: se avisa a la empresa dueña de la oferta.
  PostulacionCreada: {
    campos: ['oportunidadId', 'estudianteId', 'empresaId', 'titulo'],
    crear: (datos) => ({
      titulo: 'Nueva postulación',
      cuerpo: `Un estudiante postuló a «${datos.titulo}».`,
      enlace: `/empresa/postulantes?oferta=${datos.oportunidadId}`,
    }),
  },
  // Lo publica habilidades cuando el colegio valida: se avisa al estudiante.
  HabilidadValidada: {
    campos: ['estudianteId', 'habilidadId', 'nombre', 'colegioId'],
    crear: (datos) => ({
      titulo: 'Habilidad validada',
      cuerpo: `Tu colegio validó tu habilidad «${datos.nombre}».`,
      enlace: '/student/habilidades',
    }),
  },
}

export const TIPOS_CONOCIDOS = Object.freeze(Object.keys(PLANTILLAS))

// Devuelve la notificación del evento, o null si el evento no es para este servicio.
// Lanza EventoInvalido si el mensaje no cumple su contrato.
// El id de la notificación es el id del evento y su fecha, la del evento: si SQS entrega
// el mismo mensaje dos veces, sale la misma notificación con la misma clave (idempotencia).
export function notificacionDesdeEvento(evento) {
  if (!evento || typeof evento !== 'object') throw new EventoInvalido('el mensaje no es un objeto')
  const plantilla = PLANTILLAS[evento.tipo]
  if (!plantilla) return null
  if (evento.version !== 1) throw new EventoInvalido(`versión ${evento.version} no soportada`)
  for (const campo of ['id', 'fecha', 'destinatarioId']) {
    if (!esTexto(evento[campo])) throw new EventoInvalido(`falta ${campo}`)
  }
  if (Number.isNaN(Date.parse(evento.fecha))) throw new EventoInvalido('la fecha no es válida')
  const datos = evento.datos ?? {}
  const falta = plantilla.campos.find((campo) => !esTexto(datos[campo]))
  if (falta) throw new EventoInvalido(`falta datos.${falta}`)

  return {
    id: evento.id,
    usuarioId: evento.destinatarioId,
    tipo: evento.tipo,
    ...plantilla.crear(datos),
    leida: false,
    creadaEn: evento.fecha,
  }
}
