import { create } from 'zustand'
import { Underlay } from '../services/underlayService'

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
  setWalking: (walking: boolean) => void
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
  setWalking: (walking) => set({ walking }),
  pendingUnderlayMpp: null,
  setPendingUnderlayMpp: (pendingUnderlayMpp) => set({ pendingUnderlayMpp }),
  underlayMeta: null,
  setUnderlayMeta: (underlayMeta) => set({ underlayMeta }),
  pendingCatalogId: null,
  setPendingCatalogId: (pendingCatalogId) => set({ pendingCatalogId }),
}))
