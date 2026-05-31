import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(rootDir, 'apps', 'kmoe-app')
const distDir = path.join(appDir, 'dist')
const iosAssetsDir = path.join(appDir, 'src-tauri', 'gen', 'apple', 'assets')
const iosBuildDir = path.join(appDir, 'src-tauri', 'gen', 'apple', 'build')
const productName = 'Kmoe Client.app'

async function existsWithFiles(dir) {
  try {
    return (await readdir(dir)).length > 0
  } catch {
    return false
  }
}

if (!(await existsWithFiles(distDir))) {
  console.warn('[sync-ios-assets] skipped: frontend dist is empty')
  process.exit(0)
}

await removeStaleIosAppBundles()
await syncAssetsAtomically()

console.log(`[sync-ios-assets] copied dist to ${path.relative(rootDir, iosAssetsDir)}`)

async function syncAssetsAtomically() {
  const stagingDir = `${iosAssetsDir}.${process.pid}.tmp`
  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(stagingDir, { recursive: true })
  await cp(distDir, stagingDir, { recursive: true, force: true })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rm(iosAssetsDir, { recursive: true, force: true })
      await mkdir(path.dirname(iosAssetsDir), { recursive: true })
      await rename(stagingDir, iosAssetsDir)
      return
    } catch (error) {
      if (attempt === 2 || !isRetryableFilesystemRace(error)) throw error
    }
  }
}

async function removeStaleIosAppBundles() {
  await Promise.all([
    rm(path.join(iosBuildDir, 'arm64-sim', productName), { recursive: true, force: true }),
    rm(path.join(iosBuildDir, 'kmoe-app_iOS.xcarchive', 'Products', 'Applications', productName), { recursive: true, force: true })
  ])
}

function isRetryableFilesystemRace(error) {
  return error && typeof error === 'object' && ['EEXIST', 'ENOTEMPTY', 'ENOENT'].includes(error.code)
}
