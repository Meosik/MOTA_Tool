const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

export async function api(path: string, opts?: {method?:string, json?:any}){
  const method = opts?.method || 'GET'
  const headers:any = {'Content-Type':'application/json'}
  const body = opts?.json ? JSON.stringify(opts.json) : undefined
  const res = await fetch(`${BASE}${path}`, {method, headers, body})
  if(!res.ok) throw new Error(await res.text())
  return res.json()
}