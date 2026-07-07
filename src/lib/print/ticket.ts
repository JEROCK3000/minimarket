import type { TicketData } from '@/app/(app)/pos/ticket-actions'

const money = (n: number) => `$${n.toFixed(2)}`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pagoTxt = (fp: string) => (fp === 'TARJETA' ? 'Tarjeta' : fp === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo')

/** Filas de items comunes a ambos formatos. */
function filasItems(t: TicketData): string {
  return t.venta.items.map((it) =>
    `<tr><td class="c">${it.cantidad}</td><td>${esc(it.nombre)}</td><td class="r">${money(it.precioUnitario)}</td><td class="r">${money(it.subtotal)}</td></tr>`
  ).join('')
}

/** Cuerpo del comprobante (compartido). */
function cuerpo(t: TicketData): string {
  const f = t.factura
  return `
    <div class="center bold">${esc(t.negocio.nombre)}</div>
    ${t.negocio.ruc ? `<div class="center small">RUC: ${esc(t.negocio.ruc)}</div>` : ''}
    ${t.negocio.direccion ? `<div class="center small">${esc(t.negocio.direccion)}</div>` : ''}
    <div class="sep"></div>
    <div class="small">${f ? 'FACTURA' : 'TICKET DE VENTA'} ${f ? esc(f.numero) : esc(t.venta.numero)}</div>
    <div class="small">Fecha: ${esc(t.venta.fecha)}</div>
    <div class="small">Cliente: ${esc(t.venta.cliente)}${t.venta.clienteId ? ` (${esc(t.venta.clienteId)})` : ''}</div>
    <div class="sep"></div>
    <table>
      <thead><tr><td class="c">Cant</td><td>Producto</td><td class="r">P.U.</td><td class="r">Total</td></tr></thead>
      <tbody>${filasItems(t)}</tbody>
    </table>
    <div class="sep"></div>
    <table class="tot">
      <tr><td>Subtotal</td><td class="r">${money(t.venta.subtotal)}</td></tr>
      ${t.venta.descuento > 0 ? `<tr><td>Descuento</td><td class="r">-${money(t.venta.descuento)}</td></tr>` : ''}
      <tr><td>IVA</td><td class="r">${money(t.venta.iva)}</td></tr>
      <tr class="bold big"><td>TOTAL</td><td class="r">${money(t.venta.total)}</td></tr>
      <tr><td>Pago (${pagoTxt(t.venta.formaPago)})</td><td class="r">${t.venta.pagoCon != null ? money(t.venta.pagoCon) : money(t.venta.total)}</td></tr>
      ${t.venta.vuelto != null && t.venta.vuelto > 0 ? `<tr><td>Vuelto</td><td class="r">${money(t.venta.vuelto)}</td></tr>` : ''}
    </table>
    ${f ? `<div class="sep"></div><div class="small">Autorización SRI:</div><div class="small mono">${esc(f.autorizacion || '')}</div><div class="small">Clave de acceso:</div><div class="small mono">${esc(f.claveAcceso)}</div>` : ''}
    <div class="sep"></div>
    <div class="center small">¡Gracias por su compra!</div>
  `
}

/** Abre una ventana de impresión con el comprobante en el formato dado. */
export function imprimirTicket(t: TicketData, formato: 'termico' | 'a4') {
  const esTermico = formato === 'termico'
  const css = esTermico
    ? `@page { size: 80mm auto; margin: 0; }
       body { width: 72mm; margin: 0 auto; font-family: 'Courier New', monospace; font-size: 10px; color: #000; padding: 4mm 0; }
       table { width: 100%; border-collapse: collapse; }
       td { font-size: 10px; padding: 0.3mm 0; vertical-align: top; }
       .big td { font-size: 12px; }`
    : `@page { size: A4; margin: 18mm; }
       body { font-family: Arial, sans-serif; font-size: 12px; color: #000; max-width: 480px; }
       table { width: 100%; border-collapse: collapse; }
       td { font-size: 12px; padding: 2px 4px; vertical-align: top; }
       thead td { border-bottom: 1px solid #999; font-weight: bold; }
       .big td { font-size: 15px; }`

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comprobante ${esc(t.venta.numero)}</title>
    <style>
      ${css}
      .center { text-align: center; } .r { text-align: right; } .c { text-align: center; }
      .bold { font-weight: bold; } .small { font-size: ${esTermico ? '9px' : '11px'}; }
      .mono { font-family: 'Courier New', monospace; word-break: break-all; }
      .sep { border-top: 1px dashed #000; margin: 3px 0; }
      .tot td { padding: 1px 0; }
    </style></head><body>${cuerpo(t)}
    <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 300); };</script>
    </body></html>`

  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) { alert('Permite las ventanas emergentes para imprimir el comprobante.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
