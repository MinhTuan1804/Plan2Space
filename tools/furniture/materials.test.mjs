import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { resizeSet } from './materials.mjs'

test('a map is written at 1K and 512, never enlarged', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mat-'))
  const src = path.join(dir, 'in.png')
  await sharp({ create: { width: 2048, height: 2048, channels: 3, background: '#808080' } }).png().toFile(src)
  await resizeSet(src, dir, 'color')
  assert.equal((await sharp(path.join(dir, 'color_1k.webp')).metadata()).width, 1024)
  assert.equal((await sharp(path.join(dir, 'color_512.webp')).metadata()).width, 512)
  const small = path.join(dir, 'small.png')
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } }).png().toFile(small)
  await resizeSet(small, dir, 'normal')
  assert.equal((await sharp(path.join(dir, 'normal_1k.webp')).metadata()).width, 64)
})
