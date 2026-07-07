'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { ClienteForm } from './ClienteForm'
import { desactivarClienteAction } from './actions'

export interface ClienteRow {
  id: string; tipoIdentificacion: string; identificacion: string; nombre: string
  telefono: string | null; email: string | null; direccion: string | null; compras: number
}

export function ClientesClient({ clientes, puedeEliminar }: { clientes: ClienteRow[]; puedeEliminar: boolean }) {
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<ClienteRow | null>(null)

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return clientes
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.identificacion.includes(q))
  }, [clientes, busqueda])

  const abrirNuevo = () => { setEditando(null); setModal(true) }
  const abrirEditar = (c: ClienteRow) => { setEditando(c); setModal(true) }

  const eliminar = async (c: ClienteRow) => {
    const res = await desactivarClienteAction(c.id)
    if (res.success) toast.success('Cliente eliminado')
    else toast.error(res.error || 'No se pudo eliminar')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Clientes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{clientes.length} cliente(s)</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary"><Plus size={16} /> Nuevo cliente</button>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o identificación..." className="input pl-9" />
      </div>

      {filtrados.length === 0 ? (
        <div className="card text-center py-16">
          <Users size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {busqueda ? 'No se encontraron clientes.' : 'Aún no hay clientes. Se crean aquí o al facturar en el POS.'}
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Identificación</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold text-center">Compras</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{c.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-700 dark:text-gray-300">{c.identificacion}</span>
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-500">{c.tipoIdentificacion}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {c.telefono || c.email || '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{c.compras}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => abrirEditar(c)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 hover:text-brand-600 transition" title="Editar"><Pencil size={15} /></button>
                      {puedeEliminar && (
                        <button onClick={() => eliminar(c)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition ml-1" title="Eliminar"><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && <ClienteForm cliente={editando} onClose={() => setModal(false)} />}
    </div>
  )
}
