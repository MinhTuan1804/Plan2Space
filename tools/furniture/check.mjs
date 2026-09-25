// Verifies every normalised model against its catalog box: fits, stands on the floor, centred footprint.
// gltf-transform understands KHR_mesh_quantization; tools that do not (e.g. trimesh) report raw integers.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Logger, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(here, '../../plan2space-web/public/furniture')
const TOLERANCE_M = 0.002
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setLogger(new Logger(Logger.Verbosity.ERROR))
const catalog = JSON.parse(await readFile(path.join(OUT_DIR, 'catalog.json'), 'utf8'))

let problems = 0
for (const item of catalog.items.filter((i) => i.file)) {
  const doc = await io.read(path.join(OUT_DIR, path.basename(item.file)))
  const { min, max } = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0])
  const [w, h, d] = max.map((v, i) => v - min[i])
  const fits = w <= item.widthM + TOLERANCE_M && d <= item.depthM + TOLERANCE_M && h <= item.heightM + TOLERANCE_M
  const floor = Math.abs(min[1]) < TOLERANCE_M
  const centred = Math.abs((min[0] + max[0]) / 2) < TOLERANCE_M && Math.abs((min[2] + max[2]) / 2) < TOLERANCE_M
  if (!(fits && floor && centred)) problems++
  console.log(`${item.id.padEnd(16)} ${w.toFixed(2)} x ${h.toFixed(2)}(h) x ${d.toFixed(2)}  box ${item.widthM} x ${item.heightM} x ${item.depthM}  ${fits && floor && centred ? 'ok' : `fits=${fits} floor=${floor} centred=${centred}`}`)
}
console.log(problems ? `${problems} problem(s)` : 'all models fit their catalog box')
process.exit(problems ? 1 : 0)
