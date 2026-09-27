import { create } from 'zustand'
import { Underlay } from '../services/underlayService'
import { SectionBox } from '../lib/sectionBox'
import { Vec3 } from '../services/viewSettingsService'
import { loadQuality, Quality, saveQuality } from '../lib/quality'

// A camera move the 3D view makes and then clears: plan coordinates [x, y, height].
export interface FlyTo { position: Vec3; target: Vec3; level: number }
export type Picked = { kind: 'furniture' | 'opening' | 'room'; id: string } | null

const today = () => new Date().toISOString().slice(0, 10)

export type Tool = 'select' | 'wall' | 'opening' | 'measure' | 'furniture'
export type Selection = { kind: 'wall' | 'opening' | 'furniture' | 'room'; id: string } | null

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

interface EditorState {
  tool: Tool
  selection: Selection
  openingType: 'Door' | 'Window'
  openingWidthM: number
  underlayVisible: boolean
  underlayOpacity: number
  setTool: (tool: Tool) => void
  select: (selection: Selection) => void
  setOpeningType: (type: 'Door' | 'Window') => void
  setOpeningWidth: (widthM: number) => void
  setUnderlayVisible: (visible: boolean) => void
  setUnderlayOpacity: (opacity: number) => void
  // Bumped after the underlay's scale is corrected, so the image is fetched again with the new mapping.
  underlayRevision: number
  bumpUnderlay: () => void
  // The full-screen walk-through is open; it owns the keyboard.
  walking: boolean
  level: number                 // the storey the 2D plan shows and edits
  setLevel: (level: number) => void
  setWalking: (walking: boolean) => void
  // The 3D view's section box: null when off. A viewing aid, never saved.
  section: SectionBox | null
  setSection: (section: SectionBox | null) => void
  flyTo: FlyTo | null
  setFlyTo: (flyTo: FlyTo | null) => void
  // The sun study's day and hour (local, 5–19): viewing state, never saved.
  sunDate: string
  sunHour: number
  setSun: (date: string, hour: number) => void
  tool3d: 'select' | 'measure'
  setTool3d: (tool: 'select' | 'measure') => void
  picked: Picked
  setPicked: (picked: Picked) => void
  quality: Quality
  setQuality: (quality: Quality) => void
  // A saved calibration whose image scale could not be sent yet; retried from the editor.
  pendingUnderlayMpp: number | null
  setPendingUnderlayMpp: (mpp: number | null) => void
  // The latest import's pixel-to-metre mapping, known as soon as it is fetched (before the image loads).
  underlayMeta: Underlay | null
  setUnderlayMeta: (underlay: Underlay | null) => void
  // The catalog item the furniture tool places on the next click.
  pendingCatalogId: string | null
  setPendingCatalogId: (id: string | null) => void
}

// How the user is editing, as opposed to what the plan contains (geometryStore).
export const useEditorStore = create<EditorState>((set) => ({
  tool: 'select',
  selection: null,
  openingType: 'Door',
  openingWidthM: 0.9,
  underlayVisible: true,
  underlayOpacity: 0.35,
  setTool: (tool) => set({ tool, selection: null }),
  select: (selection) => set({ selection }),
  setOpeningType: (openingType) => set({ openingType }),
  setOpeningWidth: (widthM) => set({ openingWidthM: clamp(Number.isFinite(widthM) ? widthM : 0.9, 0.4, 3) }),
  setUnderlayVisible: (underlayVisible) => set({ underlayVisible }),
  setUnderlayOpacity: (opacity) => set({ underlayOpacity: clamp(opacity, 0.1, 1) }),
  underlayRevision: 0,
  bumpUnderlay: () => set((s) => ({ underlayRevision: s.underlayRevision + 1 })),
  walking: false,
  level: 0,
  setLevel: (level) => set({ level, selection: null }),
  setWalking: (walking) => set({ walking }),
  section: null,
  setSection: (section) => set({ section }),
  flyTo: null,
  setFlyTo: (flyTo) => set({ flyTo }),
  sunDate: today(),
  sunHour: 14,
  setSun: (sunDate, sunHour) => set({ sunDate, sunHour }),
  tool3d: 'select',
  setTool3d: (tool3d) => set({ tool3d, picked: null }),
  picked: null,
  setPicked: (picked) => set({ picked }),
  quality: loadQuality(),
  setQuality: (quality) => { saveQuality(quality); set({ quality }) },
  pendingUnderlayMpp: null,
  setPendingUnderlayMpp: (pendingUnderlayMpp) => set({ pendingUnderlayMpp }),
  underlayMeta: null,
  setUnderlayMeta: (underlayMeta) => set({ underlayMeta }),
  pendingCatalogId: null,
  setPendingCatalogId: (pendingCatalogId) => set({ pendingCatalogId }),
}))
