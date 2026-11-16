/**
 * Sincronización de la copia completa (hoja "Estado" de la planilla): qué hacer al abrir la app.
 * Un solo usuario: gana el cambio más nuevo (por fecha), sin mezclar.
 */

export interface EstadoLocal {
  /** Hay plantas, packs o polen cargados. */
  tieneDatos: boolean
  /** Fecha del último cambio hecho en este teléfono (undefined = nunca se cambió nada acá). */
  cambiado?: Date
  /** Fecha (de cambio) de la última copia que quedó guardada en la planilla, subida o bajada. */
  sincronizado?: Date
}

export interface EstadoRemoto {
  /** Hay copia completa en la planilla. */
  hayCopia: boolean
  actualizado?: Date
}

export type Decision = 'bajar' | 'subir' | 'reconstruir' | 'nada'

export function decidir(local: EstadoLocal, remoto: EstadoRemoto): Decision {
  if (!remoto.hayCopia || !remoto.actualizado) {
    // La planilla todavía no tiene copia: se sube lo de acá o, si acá no hay nada, se rearma desde las hojas.
    return local.tieneDatos ? 'subir' : 'reconstruir'
  }
  const r = remoto.actualizado.getTime()
  if (!local.cambiado) {
    // Teléfono nuevo (vacío): baja. Si tiene datos que nunca se sincronizaron, no se pisan: suben.
    return local.tieneDatos ? 'subir' : 'bajar'
  }
  const c = local.cambiado.getTime()
  const pendiente = !local.sincronizado || c > local.sincronizado.getTime()
  if (pendiente) return c > r ? 'subir' : r > c ? 'bajar' : 'nada'
  return r > c ? 'bajar' : 'nada'
}
