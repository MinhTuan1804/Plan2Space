import { apiClient } from './api'

export interface ProjectDto {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export async function listProjects(): Promise<ProjectDto[]> {
  const { data } = await apiClient.get('/projects')
  return data
}

export async function createProject(name: string): Promise<ProjectDto> {
  const { data } = await apiClient.post('/projects', { name })
  return data
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`)
}
