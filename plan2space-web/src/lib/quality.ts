// How much the 3D view spends on looks. High: SSAO, soft shadows, bloom, 1K textures. Low: none, 512 px.
export type Quality = 'high' | 'low'
const KEY = 'p2s.quality'
const DOWNGRADE_WINDOW_S = 5

export function loadQuality(): Quality {
  try { return localStorage.getItem(KEY) === 'low' ? 'low' : 'high' } catch { return 'high' }
}

export function saveQuality(q: Quality): void {
  try { localStorage.setItem(KEY, q) } catch { /* private window: the choice lasts this visit only */ }
}

// A struggling machine is only caught while the scene settles in; later dips (a big plan, a walk) are left alone.
export const shouldDowngrade = (elapsedS: number, alreadyDowngraded: boolean) => !alreadyDowngraded && elapsedS <= DOWNGRADE_WINDOW_S
