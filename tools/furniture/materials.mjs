// CC0 floor materials (ambientCG) and the sky (Poly Haven) into plan2space-web/public: each map as WebP at
// 1K and 512 (the web's Cao/Thấp quality). Downloads are cached in .cache/ (not committed).
import { mkdir, readdir, stat, writeFile, copyFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(here, '../../plan2space-web/public')
const CACHE = path.join(here, '.cache')
const MAPS = { color: '_Color', normal: '_NormalGL', roughness: '_Roughness' }

export async function resizeSet(input, outDir, name) {
  await mkdir(outDir, { recursive: true })
  const { width } = await sharp(input).metadata()
  for (const [size, px] of [['1k', 1024], ['512', 512]]) {
    await sharp(input).resize(Math.min(px, width)).webp({ quality: 82 }).toFile(path.join(outDir, `${name}_${size}.webp`))
  }
}

async function download(url, file) {
  if (await stat(file).catch(() => null)) return file
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  return file
}

async function main() {
  const sources = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(here, 'materials-sources.json'), 'utf8'))
  await mkdir(CACHE, { recursive: true })
  const lines = ['# Material and sky sources', '', 'All CC0 (public domain): free for any use, no attribution required.', '']
  for (const { id, asset } of sources.materials) {
    const zip = await download(`https://ambientcg.com/get?file=${asset}_1K-JPG.zip`, path.join(CACHE, `${asset}.zip`))
    const dir = path.join(CACHE, asset)
    await mkdir(dir, { recursive: true })
    // bsdtar reads zip (Windows 10+, macOS); on Windows take the system one, Git Bash's GNU tar reads "E:" as a host.
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
    execFileSync(tar, ['-xf', zip, '-C', dir])
    const files = await readdir(dir)
    for (const [name, suffix] of Object.entries(MAPS)) {
      const src = files.find((f) => f.includes(suffix) && /\.(jpg|png)$/i.test(f))
      if (!src) throw new Error(`${asset}: no ${suffix} map`)
      await resizeSet(path.join(dir, src), path.join(WEB, 'materials', id), name)
    }
    lines.push(`- \`${id}\`: ambientCG ${asset}, https://ambientcg.com/view?id=${asset} (CC0)`)
    console.log(`${id.padEnd(14)} ${asset}`)
  }
  const hdr = await download(sources.hdri.url, path.join(CACHE, 'sky_1k.hdr'))
  await mkdir(path.join(WEB, 'hdri'), { recursive: true })
  await copyFile(hdr, path.join(WEB, 'hdri', 'sky_1k.hdr'))
  lines.push(`- \`hdri/sky_1k.hdr\`: Poly Haven ${sources.hdri.asset}, https://polyhaven.com/a/${sources.hdri.asset} (CC0)`)
  await writeFile(path.join(WEB, 'materials', 'SOURCES.md'), lines.join('\n') + '\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
