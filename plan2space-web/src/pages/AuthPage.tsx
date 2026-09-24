import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Layers, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in both email and password.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      if (mode === 'register') {
        await register(email, password)
      }
      await login(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Authentication failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 relative overflow-hidden">
      {/* Subtle CAD grid background */}
      <div 
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#52525b 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      <div className="w-full max-w-[380px] relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 text-blue-500 mb-3 shadow-sm">
            <Layers className="w-6 h-6 stroke-[1.75]" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center justify-center gap-2">
            Plan2Space <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">STUDIO</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">2D Architectural Vectorization & 3D Real-time Space</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-[#121215] border border-zinc-800/80 p-7 shadow-xl shadow-black/40">
          <div className="mb-6">
            <h1 className="text-lg font-medium text-zinc-100">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              {mode === 'login'
                ? 'Enter your credentials to access your floorplan workspace'
                : 'Start converting 2D drawings into real-time 3D spaces'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email address</label>
              <input
                className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
              <input
                className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-medium text-sm py-2.5 shadow-sm shadow-blue-600/20 transition disabled:opacity-50"
              type="submit"
              disabled={loading}
            >
              <span>{mode === 'login' ? 'Sign in' : 'Register'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-zinc-800/80 text-center">
            <button
              type="button"
              className="text-xs text-zinc-400 hover:text-zinc-200 transition"
              onClick={() => {
                setError(null)
                setMode(mode === 'login' ? 'register' : 'login')
              }}
            >
              {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
            </button>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
            PostGIS spatial engine
          </span>
          <span>·</span>
          <span>WebGL 60 FPS</span>
        </div>
      </div>
    </div>
  )
}
