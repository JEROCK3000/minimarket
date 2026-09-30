/**
 * Identificación con que se EMITIÓ una venta.
 *
 * Al registrar la venta se congela la identificación del cliente
 * (`Venta.tipoIdentificacionComprador` / `identificacionComprador`), porque un
 * mismo cliente puede facturar un día con cédula y otro con RUC. La factura, la
 * nota de crédito, el RIDE y el ticket deben usar la de ESA venta, no la actual
 * del cliente. Ventas anteriores a este campo (NULL) usan la del cliente.
 */
interface VentaConComprador {
  tipoIdentificacionComprador: string | null
  identificacionComprador: string | null
  cliente: { tipoIdentificacion: string; identificacion: string } | null
}

export function compradorDeVenta(venta: VentaConComprador): { tipoIdentificacion: string; identificacion: string } | null {
  if (!venta.cliente) return null
  return {
    tipoIdentificacion: venta.tipoIdentificacionComprador ?? venta.cliente.tipoIdentificacion,
    identificacion: venta.identificacionComprador ?? venta.cliente.identificacion,
  }
}
