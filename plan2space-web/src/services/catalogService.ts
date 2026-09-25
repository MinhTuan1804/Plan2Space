import { useEffect, useState } from 'react'
import { RoomType } from '../lib/roomTypes'
import type { DoorSpec } from '../components/studio/Viewer3D/openingFixtures'

export interface CatalogEntry {
  id: string
  name: string
  file: string | null
  widthM: number
  depthM: number
  heightM: number
  elevationM: number
  againstWall: boolean
  roomTypes: RoomType[]
  attribution: string
}

export interface CatalogDoor extends DoorSpec {
  frame: string
  leaf: string
}

export interface Catalog {
  items: CatalogEntry[]
  autoFurnish: Record<RoomType, string[]>
  door?: CatalogDoor | null
  byId: Record<string, CatalogEntry>
}

let cached: Promise<Catalog> | null = null

// A static file served next to the app: the single catalog every layer reads.
export function loadCatalog(): Promise<Catalog> {
  cached ??= fetch('/furniture/catalog.json')
    .then((r) => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json() })
    .then((c) => ({ ...c, byId: Object.fromEntries(c.items.map((i: CatalogEntry) => [i.id, i])) }))
    .catch((e) => { cached = null; throw e })
  return cached
}

export function useCatalog(): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    let alive = true
    loadCatalog().then((c) => { if (alive) setCatalog(c) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return catalog
}
