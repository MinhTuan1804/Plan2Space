import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listProjects, createProject, deleteProject, ProjectDto } from '../services/projectsService'
import { useAuthStore } from '../stores/authStore'
import { Layers, Plus, Trash2, ArrowUpRight, FolderGit2, LogOut, Clock, Building2 } from 'lucide-react'

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  async function refresh() {
    try {
      const data = await listProjects()
      setProjects(data || [])
      setLoadError(null)
    } catch {
      setLoadError('Could not load projects. Check your connection and try again.')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await createProject(name.trim())
      setName('')
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this project?')) return
    await deleteProject(id)
    await refresh()
  }

  function handleLogout() {
    logout()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      {/* Top Studio Navigation */}
      <header className="border-b border-zinc-800/80 bg-[#121215]/80 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
            <Layers className="w-4 h-4 stroke-[2]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight text-white text-base">Plan2Space</span>
            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-800/60 px-1.5 py-0.5 rounded border border-zinc-700/40">STUDIO</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-mono">{user.email}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </header>

      {/* Main Workspace Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {/* Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Projects</h1>
            <p className="text-xs text-zinc-400 mt-1">Manage your 2D plans, vectorization jobs, and 3D scenes</p>
          </div>

          {/* Create Project Form */}
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <div className="relative">
              <input
                className="w-64 sm:w-72 rounded-lg bg-zinc-900 border border-zinc-800 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white px-4 py-2 text-sm font-medium transition disabled:opacity-50 shadow-sm shadow-blue-600/20"
            >
              <Plus className="w-4 h-4 stroke-[2]" />
              <span>Create</span>
            </button>
          </form>
        </div>

        {loadError && (
          <div role="alert" className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400">
            {loadError}
          </div>
        )}

        {/* Projects Grid */}
        {loadError ? null : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center bg-[#121215]/30">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-medium text-zinc-300">No projects yet</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Create a new project above to upload DXF, PNG/JPG or PDF floorplans for 3D vectorization.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-xl bg-[#121215] border border-zinc-800/80 hover:border-zinc-700/80 p-5 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 text-blue-400 flex items-center justify-center shrink-0">
                      <FolderGit2 className="w-4 h-4" />
                    </div>
                  </div>

                  <Link
                    to={`/studio/${p.id}`}
                    className="text-lg font-semibold text-zinc-100 hover:text-blue-400 hover:underline transition block line-clamp-1"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                    Floorplan CAD drawing & interactive 3D spatial model.
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-[11px]">
                    <Clock className="w-3 h-3" />
                    <span>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Recent'}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-xs text-red-400 hover:text-red-300 hover:underline transition"
                    >
                      Delete
                    </button>
                    <Link
                      to={`/studio/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium group-hover:translate-x-0.5 transition"
                    >
                      Open
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
