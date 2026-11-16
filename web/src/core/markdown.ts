/** Negritas, cursivas y código del markdown de Claude (el resto queda como texto, con sus saltos de línea). */
export function markdownEnLinea(s: string): string {
  const seguro = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return seguro
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/^#{1,6} +(.+)$/gm, '<strong>$1</strong>')
}
