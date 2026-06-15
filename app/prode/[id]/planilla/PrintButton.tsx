'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{ background: '#C8950A', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
    >
      🖨 Imprimir / Guardar PDF
    </button>
  )
}
