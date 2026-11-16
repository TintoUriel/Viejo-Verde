import { describe, expect, it } from 'vitest'
import { markdownEnLinea } from '../src/core/markdown'

describe('Markdown del chat', () => {
  it('negritas, cursivas, código y títulos', () => {
    expect(markdownEnLinea('**Regá** mañana, *temprano*. Usá `Top Veg`.'))
      .toBe('<strong>Regá</strong> mañana, <em>temprano</em>. Usá <code>Top Veg</code>.')
    expect(markdownEnLinea('## Pasos\n1. Mirá')).toBe('<strong>Pasos</strong>\n1. Mirá')
  })

  it('escapa el HTML antes de formatear', () => {
    expect(markdownEnLinea('<img src=x onerror=alert(1)> **ok**')).toBe('&lt;img src=x onerror=alert(1)&gt; <strong>ok</strong>')
  })
})
