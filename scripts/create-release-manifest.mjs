#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..')
const APP_DIR = path.join(ROOT_DIR, 'apps', 'kmoe-app')
const TAURI_DIR = path.join(APP_DIR, 'src-tauri')

const args = new Set(process.argv.slice(2))
const profile = readArg('--profile') ?? process.env.KMOE_TAURI_PROFILE ?? 'debug'
const requireArtifacts = args.has('--require-artifacts')
const outputArg = readArg('--output')

if (args.has('--self-test')) {
  await selfTest()
  process.exit(0)
}

if (!['debug', 'release'].includes(profile)) {
  throw new Error(`Unsupported profile: ${profile}`)
}

const rootPackage = await readJson(path.join(ROOT_DIR, 'package.json'))
const appPackage = await readJson(path.join(APP_DIR, 'package.json'))
const tauriConfig = await readJson(path.join(TAURI_DIR, 'tauri.conf.json'))

if (rootPackage.version !== appPackage.version || appPackage.version !== tauriConfig.version) {
  throw new Error(
    `Version mismatch: root=${rootPackage.version}, app=${appPackage.version}, tauri=${tauriConfig.version}`
  )
}

const targetDir = path.join(TAURI_DIR, 'target', profile)
const bundleDir = path.join(targetDir, 'bundle')
const artifacts = await findArtifacts(bundleDir, tauriConfig.productName)

if (requireArtifacts && artifacts.length === 0) {
  throw new Error(`No release artifacts found under ${path.relative(ROOT_DIR, bundleDir)}`)
}

const manifest = {
  schemaVersion: 1,
  productName: tauriConfig.productName,
  identifier: tauriConfig.identifier,
  version: tauriConfig.version,
  profile,
  generatedAt: new Date().toISOString(),
  git: readGitState(),
  safety: {
    realDownloadsExecuted: false,
    authorizationUrls: 'omitted',
    credentials: 'omitted',
    cookies: 'omitted'
  },
  artifacts
}

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
assertNoSensitiveManifestText(manifestJson)

const outputPath = outputArg
  ? path.resolve(ROOT_DIR, outputArg)
  : path.join(bundleDir, 'release-manifest.json')
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, manifestJson)
console.log(`release_manifest=${path.relative(ROOT_DIR, outputPath)} artifacts=${artifacts.length}`)

function readArg(name) {
  return readArgFrom(process.argv.slice(2), name)
}

function readArgFrom(argv, name) {
  const prefix = `${name}=`
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
    if (arg === name) {
      const next = argv[index + 1]
      return next && !next.startsWith('--') ? next : undefined
    }
  }
  return undefined
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function findArtifacts(bundleDir, productName) {
  const candidates = [
    {
      platform: 'macos',
      kind: 'app',
      filePath: path.join(bundleDir, 'macos', `${productName}.app`)
    },
    ...(await filesByExtension(path.join(bundleDir, 'manual-dmg'), '.dmg')).map((filePath) => ({
      platform: 'macos',
      kind: 'dmg',
      filePath
    })),
    ...(await filesByExtension(path.join(bundleDir, 'msi'), '.msi')).map((filePath) => ({
      platform: 'windows',
      kind: 'msi',
      filePath
    })),
    ...(await filesByExtension(path.join(bundleDir, 'nsis'), '.exe')).map((filePath) => ({
      platform: 'windows',
      kind: 'nsis',
      filePath
    }))
  ]

  const artifacts = []
  for (const candidate of candidates) {
    const info = await safeStat(candidate.filePath)
    if (!info) continue
    const digest = info.isDirectory()
      ? await hashDirectory(candidate.filePath)
      : {
          sha256: await hashFile(candidate.filePath),
          sizeBytes: info.size,
          fileCount: 1
        }
    artifacts.push({
      id: `${candidate.platform}-${candidate.kind}`,
      platform: candidate.platform,
      kind: candidate.kind,
      path: path.relative(ROOT_DIR, candidate.filePath),
      sizeBytes: digest.sizeBytes,
      fileCount: digest.fileCount,
      sha256: digest.sha256
    })
  }
  return artifacts.sort((a, b) => a.id.localeCompare(b.id))
}

async function filesByExtension(dir, extension) {
  try {
    const names = await readdir(dir)
    return names
      .filter((name) => name.endsWith(extension))
      .sort()
      .map((name) => path.join(dir, name))
  } catch {
    return []
  }
}

async function safeStat(filePath) {
  try {
    return await stat(filePath)
  } catch {
    return undefined
  }
}

async function hashDirectory(dir) {
  const files = await listFiles(dir)
  const treeHash = createHash('sha256')
  let sizeBytes = 0

  for (const filePath of files) {
    const relativePath = path.relative(dir, filePath).split(path.sep).join('/')
    const fileInfo = await stat(filePath)
    const fileHash = await hashFile(filePath)
    sizeBytes += fileInfo.size
    treeHash.update('file\0')
    treeHash.update(relativePath)
    treeHash.update('\0')
    treeHash.update(String(fileInfo.size))
    treeHash.update('\0')
    treeHash.update(fileHash)
    treeHash.update('\0')
  }

  return {
    sha256: treeHash.digest('hex'),
    sizeBytes,
    fileCount: files.length
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath)))
    } else if (entry.isFile()) {
      files.push(filePath)
    }
  }
  return files
}

async function hashFile(filePath) {
  const buffer = await readFile(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

function readGitState() {
  return {
    commit: runGit(['rev-parse', 'HEAD']) ?? 'unknown',
    workingTreeDirty: Boolean(runGit(['status', '--short']))
  }
}

function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function assertNoSensitiveManifestText(text) {
  const forbidden = [
    /getdownurl\.php/i,
    /set-cookie:/i,
    /authorization:\s*bearer/i,
    new RegExp(`${'session'}=[a-z0-9_%.-]{12,}`, 'i'),
    new RegExp(`${'token'}=[a-z0-9_%.-]{12,}`, 'i'),
    new RegExp(`${'password'}=[^ <\`"']{8,}`, 'i')
  ]
  if (forbidden.some((pattern) => pattern.test(text))) {
    throw new Error('Release manifest contains sensitive or temporary authorization data.')
  }
}

async function selfTest() {
  const root = await mkdtemp(path.join(tmpdir(), 'kmoe-manifest-'))
  try {
    const filePath = path.join(root, 'artifact.bin')
    await writeFile(filePath, 'kmoe')
    const dir = path.join(root, 'bundle.app', 'Contents')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'Info.plist'), 'plist')

    const fileHash = await hashFile(filePath)
    const dirHash = await hashDirectory(path.join(root, 'bundle.app'))
    const expectedFileHash = createHash('sha256').update('kmoe').digest('hex')

    if (fileHash !== expectedFileHash) throw new Error('file hash self-test failed')
    if (dirHash.sizeBytes !== 5 || dirHash.fileCount !== 1) {
      throw new Error('directory hash self-test failed')
    }
    if (readArgFrom(['--profile=debug'], '--profile') !== 'debug') {
      throw new Error('equals-style argument self-test failed')
    }
    if (readArgFrom(['--profile', 'release'], '--profile') !== 'release') {
      throw new Error('space-style argument self-test failed')
    }
    if (readArgFrom(['--', '--output', 'manifest.json'], '--output') !== 'manifest.json') {
      throw new Error('pnpm passthrough argument self-test failed')
    }
    assertNoSensitiveManifestText(JSON.stringify({ url: 'safe' }))
    console.log('release_manifest_self_test=ok')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
