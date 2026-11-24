// Error del dominio: trae el código HTTP que corresponde, pero no sabe nada de HTTP.
// El handler lo traduce a una respuesta; cualquier otro error es un 500.
export class ErrorDominio extends Error {
  constructor(estado, mensaje) {
    super(mensaje)
    this.estado = estado
  }
}

// Un mensaje de la cola que no cumple su contrato (contracts/eventos/*.json).
// No se puede procesar nunca: se devuelve como fallido y, tras 5 intentos, termina en la DLQ.
export class EventoInvalido extends Error {}
