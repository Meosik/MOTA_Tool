
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

export async function getJSON<T=any>(url: string): Promise<T>{
  const r = await fetch(url)
  if(!r.ok) throw new Error(await r.text())
  return r.json()
}
