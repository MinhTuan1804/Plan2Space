import { create } from 'zustand'

export type Tool = 'select' | 'wall' | 'opening' | 'measure'
export type Selection = { kind: 'wall' | 'opening'; id: string } | null

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
}))
