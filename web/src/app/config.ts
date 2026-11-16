import type { Cifrado } from '../core/cifrado'

/**
 * La planilla de Google (URL del Web App y token), cifrada con la contraseña de entrada a la app.
 * Sin la contraseña no se puede leer: esto es público (repo y página), la contraseña no.
 *
 * Para cambiarla (o si cambiás el token o la URL), generá un cifrado nuevo con `cifrarJSON`
 * de core/cifrado.ts: cifrarJSON({ url, token }, contraseña, 1_000_000).
 */
export const PLANILLA_CIFRADA: Cifrado = {
  sal: 'msuTguvkP+5j4UecUe+3Qg==',
  iv: 'vYTRzJ2204BReD9t',
  datos:
    'vdJ3TB2qn8QnIpo8Y1CPHbQbx2NH2uCPvGNtjGR74Ys+Wwb1jfmzawhHO0u8uWYqkeSV+8PoHBeBK/jTBvVNQ+nLoZuxyKqJZkLWjeBPPnZfKuDkEDjrt0eUSinOwWn8s8kaqvDyjwjvustLmOkiXEuLENEIcfq8ZOpVy2lps98Ma2m5PcVyAk3Y8uMTLVFNyJSm34TLkHxWptFpdXOqaMh7sEG9TVDzIUTciTo7PJaKOEpaGyY6+6OOE7aCGqmsjZ44uwm7DtsSdHMHOn67Wk421I4sf2U=',
  iteraciones: 1_000_000,
}
