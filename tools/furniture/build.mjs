// Normalises plan2space/model3d/*.glb into plan2space-web/public/furniture/ and writes catalog.json.
import { readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Logger, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, weld, simplify, quantize, textureCompress, getBounds } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { fitTransform, yawQuaternion } from './fit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = path.resolve(here, '../../model3d')
const OUT_DIR = path.resolve(here, '../../plan2space-web/public/furniture')
const MAX_BYTES = 2 * 1024 * 1024
const MAX_TRIANGLES = 30000
// Each step trades detail for size: smaller textures and a looser simplification error.
const BUDGET_STEPS = [{ texturePx: 1024, error: 0.01 }, { texturePx: 512, error: 0.03 }, { texturePx: 256, error: 0.08 }]

async function normalise(file, entry, yawOffsetDeg, { texturePx, error }) {
  const doc = await io.read(file)
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  const t = fitTransform(getBounds(scene), entry, yawOffsetDeg)
  const root = doc.createNode(`${entry.id}_normalised`)
    .setScale([t.scale, t.scale, t.scale]).setRotation(yawQuaternion(t.yawDeg)).setTranslation(t.translation)
  for (const child of scene.listChildren()) { scene.removeChild(child); root.addChild(child) }
  scene.addChild(root)
  const tris = triangleCount(doc)
  await doc.transform(
    dedup(), prune(), weld(),
    ...(tris > MAX_TRIANGLES ? [simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIANGLES / tris, error })] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texturePx, texturePx] }),
    quantize(),
  )
  const out = path.join(OUT_DIR, `${entry.id}.glb`)
  await io.write(out, doc)
  const { size } = await stat(out)
  return { size, tris, trisOut: triangleCount(doc), texturePx, scale: t.scale, yawDeg: t.yawDeg }
}
function triangleCount(doc) {
  let n = 0
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      n += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3
    }
  return n
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setLogger(new Logger(Logger.Verbosity.ERROR))
const tooHeavy = []
const sources = JSON.parse(await readFile(path.join(here, 'sources.json'), 'utf8'))
await MeshoptSimplifier.ready
await mkdir(OUT_DIR, { recursive: true })

const items = []
for (const s of sources.items) {
  const { source, yawOffsetDeg = 0, ...entry } = s
  if (!source) {
    items.push({ ...entry, file: null, attribution: s.attribution ?? '' })
    continue
  }
  // Models with many textures stay over budget at 1024 px: halve the textures until the file fits.
  let result = null
  for (const step of BUDGET_STEPS) {
    result = await normalise(path.join(SOURCE_DIR, source), entry, yawOffsetDeg, step)
    if (result.size <= MAX_BYTES) break
  }
  if (result.size > MAX_BYTES) {
    // Too detailed to ship: show a box of the right size and ask for a lighter model rather than fail the build.
    await rm(path.join(OUT_DIR, `${entry.id}.glb`), { force: true })
    tooHeavy.push(`${entry.id} (${source}: ${(result.size / 1e6).toFixed(1)} MB, ${Math.round(result.trisOut)} tris at the smallest step)`)
    items.push({ ...entry, file: null, attribution: s.attribution ?? '' })
    continue
  }
  console.log(`${entry.id.padEnd(16)} ${(result.size / 1e6).toFixed(2)} MB  ${Math.round(result.tris)}→${Math.round(result.trisOut)} tris  textures ${result.texturePx}px  scale ${result.scale.toPrecision(3)}  yaw ${result.yawDeg}`)
  items.push({ ...entry, file: `/furniture/${entry.id}.glb`, attribution: s.attribution ?? '' })
}
await writeFile(path.join(OUT_DIR, 'catalog.json'), JSON.stringify({ items, autoFurnish: sources.autoFurnish }, null, 2) + '\n')
console.log(`catalog.json: ${items.length} items`)
if (tooHeavy.length) {
  console.log('\nDrawn as boxes until a lighter model is supplied:')
  for (const line of tooHeavy) console.log(`  ${line}`)
}
