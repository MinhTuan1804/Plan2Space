import * as THREE from 'three'

// One lighting setup for the 3D view and the walk. Measured on painted walls: with the old dim, brown-tinted
// light and ACES tone mapping a white wall showed as #9A9793 and mint #CFE3D4 as #798476. Neutral tone mapping
// and a bright neutral sky keep every paint within about 5-12 % of the colour chosen, in its own hue.
export const TONE_MAPPING = THREE.NeutralToneMapping
export const SKY_LIGHT = { sky: '#ffffff', ground: '#e9e5dd', intensity: 2.8 } as const
export const SUN_INTENSITY = 1.0
