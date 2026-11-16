import { describe, expect, it } from 'vitest'
import { decidir } from '../src/core/sync/copia'

const t = (min: number) => new Date(Date.UTC(2026, 10, 20, 12, min))

describe('Copia completa: qué hacer al abrir', () => {
  it('sin copia en la planilla: sube lo de acá o reconstruye desde las hojas', () => {
    expect(decidir({ tieneDatos: true, cambiado: t(1) }, { hayCopia: false })).toBe('subir')
    expect(decidir({ tieneDatos: false }, { hayCopia: false })).toBe('reconstruir')
  })

  it('teléfono nuevo baja; uno con datos nunca sincronizados no se pisa', () => {
    expect(decidir({ tieneDatos: false }, { hayCopia: true, actualizado: t(5) })).toBe('bajar')
    expect(decidir({ tieneDatos: true }, { hayCopia: true, actualizado: t(5) })).toBe('subir')
  })

  it('sin cambios pendientes: baja solo si la planilla es más nueva', () => {
    expect(decidir({ tieneDatos: true, cambiado: t(5), sincronizado: t(5) }, { hayCopia: true, actualizado: t(9) })).toBe('bajar')
    expect(decidir({ tieneDatos: true, cambiado: t(5), sincronizado: t(5) }, { hayCopia: true, actualizado: t(5) })).toBe('nada')
  })

  it('con cambios pendientes: gana el más nuevo', () => {
    expect(decidir({ tieneDatos: true, cambiado: t(8), sincronizado: t(5) }, { hayCopia: true, actualizado: t(5) })).toBe('subir')
    expect(decidir({ tieneDatos: true, cambiado: t(6), sincronizado: t(5) }, { hayCopia: true, actualizado: t(9) })).toBe('bajar')
    expect(decidir({ tieneDatos: true, cambiado: t(8) }, { hayCopia: true, actualizado: t(5) })).toBe('subir')
  })

  it('borrar todo también viaja (cambio local más nuevo, aunque quede vacío)', () => {
    expect(decidir({ tieneDatos: false, cambiado: t(9), sincronizado: t(5) }, { hayCopia: true, actualizado: t(5) })).toBe('subir')
  })
})
