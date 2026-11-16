import { describe, expect, it } from 'vitest'
import { PLANILLA_CIFRADA } from '../src/app/config'
import { cifrarJSON, descifrarJSON } from '../src/core/cifrado'

describe('Cifrado con contraseña', () => {
  it('ida y vuelta, y otra contraseña no abre', async () => {
    const c = await cifrarJSON({ url: 'https://x/exec', token: 'abc' }, 'clave de prueba', 1000)
    expect(await descifrarJSON(c, 'clave de prueba')).toEqual({ url: 'https://x/exec', token: 'abc' })
    expect(await descifrarJSON(c, 'otra')).toBeUndefined()
  })

  it('la planilla cifrada del código no se abre con cualquier cosa', async () => {
    // (La contraseña real no está en el repo: acá solo se prueba que una equivocada no abre.)
    expect(await descifrarJSON(PLANILLA_CIFRADA, 'equivocada')).toBeUndefined()
    expect(PLANILLA_CIFRADA.iteraciones).toBeGreaterThanOrEqual(600_000)
  })
})
