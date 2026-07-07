import { redirect } from 'next/navigation'
import { estaAutenticado } from '@/lib/auth/jwt'

export default async function Home() {
  redirect((await estaAutenticado()) ? '/dashboard' : '/login')
}
