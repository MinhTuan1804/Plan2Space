import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { apiClient } from '../services/api'

interface AdminUser { id: string; email: string; role: string; projectCount: number; createdAt: string }
interface AdminProject { id: string; name: string; ownerEmail: string; updatedAt: string }
interface AdminJob { id: string; projectId: string; status: string; progressPercent: number; error?: string | null; createdAt: string }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-[#121215]">
        <table className="w-full text-left text-xs">{children}</table>
      </div>
    </section>
  )
}

const th = 'px-3 py-2 font-medium text-zinc-400 border-b border-zinc-800'
const td = 'px-3 py-2 text-zinc-200 border-b border-zinc-800/60'
const date = (iso: string) => (iso ? new Date(iso).toLocaleString() : '')

// Oversight for admins (GET /api/admin/*; the API enforces the Admin role).
export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([apiClient.get('/admin/users'), apiClient.get('/admin/projects'), apiClient.get('/admin/jobs')])
      .then(([u, p, j]) => {
        setUsers(u.data)
        setProjects(p.data)
        setJobs(j.data)
      })
      .catch((err) =>
        setError(err?.response?.status === 403 ? 'Admins only — your account does not have access.' : 'Could not load admin data.')
      )
  }, [])

  return (
    <div className="min-h-screen bg-[#09090b] px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Projects
        </Link>
        <h1 className="mb-6 text-2xl font-semibold">Admin</h1>

        {error ? (
          <div role="alert" className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400">{error}</div>
        ) : (
          <>
            <Section title={`Users (${users.length})`}>
              <thead><tr><th className={th}>Email</th><th className={th}>Role</th><th className={th}>Projects</th><th className={th}>Joined</th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.id}><td className={td}>{u.email}</td><td className={td}>{u.role}</td><td className={td}>{u.projectCount}</td><td className={td}>{date(u.createdAt)}</td></tr>
              ))}</tbody>
            </Section>
            <Section title={`Projects (${projects.length})`}>
              <thead><tr><th className={th}>Name</th><th className={th}>Owner</th><th className={th}>Updated</th></tr></thead>
              <tbody>{projects.map((p) => (
                <tr key={p.id}><td className={td}>{p.name}</td><td className={td}>{p.ownerEmail}</td><td className={td}>{date(p.updatedAt)}</td></tr>
              ))}</tbody>
            </Section>
            <Section title={`AI jobs (${jobs.length})`}>
              <thead><tr><th className={th}>Job</th><th className={th}>Status</th><th className={th}>Progress</th><th className={th}>Error</th><th className={th}>Created</th></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.id}>
                  <td className={`${td} font-mono`}>{j.id.slice(0, 8)}</td><td className={td}>{j.status}</td>
                  <td className={td}>{j.progressPercent}%</td><td className={`${td} text-red-300`}>{j.error}</td><td className={td}>{date(j.createdAt)}</td>
                </tr>
              ))}</tbody>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
