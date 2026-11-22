// Puerto de salida: lo que los casos de uso necesitan guardar y leer.
// Lo implementa el adaptador de DynamoDB y, en las pruebas, uno en memoria (test/dobles.mjs).
// En TypeScript sería una interface; aquí se documenta y se revisa con comprobarPuerto.
//
// guardar(notificacion) -> Promise<boolean>          (false si ya existía: el evento llegó repetido)
// listar(usuarioId) -> Promise<notificacion[]>        (más nuevas primero)
// marcarLeida(usuarioId, id) -> Promise<boolean>     (false si no existe)
// marcarTodasLeidas(usuarioId) -> Promise<number>    (cuántas pasaron a leídas)
// eliminar(usuarioId, id) -> Promise<boolean>        (false si no existe)
// contarNoLeidas(usuarioId) -> Promise<number>       (cuántas tiene sin leer)
export const METODOS_REPOSITORIO_NOTIFICACIONES = Object.freeze([
  'guardar',
  'listar',
  'marcarLeida',
  'marcarTodasLeidas',
  'eliminar',
  'contarNoLeidas',
])
