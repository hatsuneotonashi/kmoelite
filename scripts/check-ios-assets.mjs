#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(rootDir, 'apps', 'kmoe-app')
const distDir = path.join(appDir, 'dist')
const iosAssetsDir = path.join(appDir, 'src-tauri', 'gen', 'apple', 'assets')

const [distFiles, iosFiles] = await Promise.all([
  fingerprintTree(distDir),
  fingerprintTree(iosAssetsDir)
])

const distKeys = Object.keys(distFiles).sort()
const iosKeys = Object.keys(iosFiles).sort()
const missing = distKeys.filter((key) => !(key in iosFiles))
const extra = iosKeys.filter((key) => !(key in distFiles))
const changed = distKeys.filter((key) => iosFiles[key] && iosFiles[key] !== distFiles[key])

if (missing.length || extra.length || changed.length) {
  console.error('[check-ios-assets] iOS asset bundle is stale.')
  if (missing.length) console.error(`missing in iOS assets: ${missing.slice(0, 20).join(', ')}`)
  if (extra.length) console.error(`extra in iOS assets: ${extra.slice(0, 20).join(', ')}`)
  if (changed.length) console.error(`changed in iOS assets: ${changed.slice(0, 20).join(', ')}`)
  console.error('Run pnpm --dir apps/kmoe-app build to refresh dist and iOS assets.')
  process.exit(1)
}

console.log(`[check-ios-assets] ok files=${distKeys.length}`)

async function fingerprintTree(dir) {
  const entries = {}
  await walk(dir, '')
  return entries

  async function walk(current, relative) {
    const items = await readdir(current, { withFileTypes: true })
    for (const item of items) {
      const itemPath = path.join(current, item.name)
      const itemRelative = path.posix.join(relative, item.name)
      if (item.isDirectory()) {
        await walk(itemPath, itemRelative)
      } else if (item.isFile()) {
        const metadata = await stat(itemPath)
        entries[itemRelative] = `${metadata.size}:${await hashFile(itemPath)}`
      }
    }
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
