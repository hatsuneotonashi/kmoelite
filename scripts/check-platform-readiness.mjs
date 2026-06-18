#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..')
const APP_DIR = path.join(ROOT_DIR, 'apps', 'kmoe-app')
const TAURI_DIR = path.join(APP_DIR, 'src-tauri')
const EXTRA_BIN_DIRS = [
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.gem', 'ruby', '2.6.0', 'bin')
]

const args = new Set(process.argv.slice(2))
const outputArg = readArg('--output')

if (args.has('--self-test')) {
  await selfTest()
  process.exit(0)
}

const rootPackage = await readJson(path.join(ROOT_DIR, 'package.json'))
const appPackage = await readJson(path.join(APP_DIR, 'package.json'))
const tauriConfig = await readJson(path.join(TAURI_DIR, 'tauri.conf.json'))
const installedRustTargets = commandOutput('rustup', ['target', 'list', '--installed']).stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

const checks = []
const hostPlatform = process.platform
addCheck({
  id: 'safety.real_download_scope',
  platform: 'all',
  status: 'pass',
  summary: 'Real downloads are native single-item queue operations.',
  detail: 'Readiness checks inspect code, tools, and artifacts; they must not authorize or download live comic files.'
})

addCommandCheck('tool.node', 'all', 'node', ['--version'], 'Node runtime is available.')
addCommandCheck('tool.pnpm', 'all', 'pnpm', ['--version'], 'pnpm is available.')
addCommandCheck('tool.rustc', 'all', 'rustc', ['--version'], 'Rust compiler is available.')
addCommandCheck('tool.cargo', 'all', 'cargo', ['--version'], 'Cargo is available.')
addCommandCheck('tool.rustup', 'all', 'rustup', ['--version'], 'rustup is available for target management.')

addScriptCheck('script.release_gate', 'all', rootPackage, 'verify:release')
addScriptCheck('script.platform_readiness', 'all', rootPackage, 'check:platforms')
addScriptCheck('script.ios_assets_check', 'ios', rootPackage, 'check:ios-assets')
addScriptCheck('script.ios_sim_smoke', 'ios', rootPackage, 'smoke:ios-sim')
addScriptCheck('script.ios_tools_setup', 'ios', rootPackage, 'setup:ios-tools')
addScriptCheck('script.macos_app', 'macos', rootPackage, 'tauri:build:mac-app:debug')
addScriptCheck('script.macos_app_smoke', 'macos', rootPackage, 'smoke:mac-app')
addScriptCheck('script.macos_dmg', 'macos', rootPackage, 'tauri:build:mac-dmg:debug')
addScriptCheck('script.android_build', 'android', rootPackage, 'tauri:android:build:debug')
addScriptCheck('script.android_run', 'android', rootPackage, 'tauri:android:run')
addScriptCheck('script.android_device_smoke', 'android', rootPackage, 'smoke:android-device')
addScriptCheck('script.windows_msi', 'windows', rootPackage, 'tauri:build:windows-msi')
addScriptCheck('script.windows_nsis', 'windows', rootPackage, 'tauri:build:windows-nsis')
addScriptCheck('script.app_platform_readiness', 'all', appPackage, 'check:platforms')
addScriptCheck('script.app_macos_app_smoke', 'macos', appPackage, 'smoke:mac-app')
addScriptCheck('script.app_ios_tools_setup', 'ios', appPackage, 'setup:ios-tools')
addScriptCheck('script.app_android_build', 'android', appPackage, 'tauri:android:build:debug')
addScriptCheck('script.app_android_run', 'android', appPackage, 'tauri:android:run')
addScriptCheck('script.app_android_device_smoke', 'android', appPackage, 'smoke:android-device')

addCheck({
  id: 'tauri.identifier',
  platform: 'all',
  status: tauriConfig.identifier === 'moe.kzo.client' ? 'pass' : 'warn',
  summary: `identifier=${tauriConfig.identifier}`,
  detail: 'Bundle identifier should remain stable across desktop and mobile validation.'
})

addCheck({
  id: 'tauri.bundle_icons',
  platform: 'all',
  status: hasIcon(tauriConfig, 'icons/icon.icns') && hasIcon(tauriConfig, 'icons/icon.ico') ? 'pass' : 'warn',
  summary: 'macOS and Windows icon entries are configured.',
  detail: 'Tauri bundle icon list should include both ICNS and ICO entries.'
})

const windowsIconAssets = [
  'icons/StoreLogo.png',
  'icons/Square44x44Logo.png',
  'icons/Square150x150Logo.png',
  'icons/Square310x310Logo.png'
]
const hasWindowsIconAssets = filesExist(windowsIconAssets)
addCheck({
  id: 'tauri.windows_icon_assets',
  platform: 'windows',
  status: hasWindowsIconAssets ? 'pass' : 'warn',
  summary: hasWindowsIconAssets ? 'Windows Store/Square icon assets are present.' : 'Windows Store/Square icon assets are incomplete.',
  detail: 'Windows packaging should keep StoreLogo and SquareLogo assets available for installer/app metadata.'
})

const iosIconAssets = [
  'icons/ios/AppIcon-20x20@2x.png',
  'icons/ios/AppIcon-20x20@3x.png',
  'icons/ios/AppIcon-29x29@2x.png',
  'icons/ios/AppIcon-29x29@3x.png',
  'icons/ios/AppIcon-40x40@2x.png',
  'icons/ios/AppIcon-40x40@3x.png',
  'icons/ios/AppIcon-60x60@2x.png',
  'icons/ios/AppIcon-60x60@3x.png',
  'icons/ios/AppIcon-76x76@1x.png',
  'icons/ios/AppIcon-76x76@2x.png',
  'icons/ios/AppIcon-83.5x83.5@2x.png',
  'icons/ios/AppIcon-512@2x.png'
]
const hasIosIconAssets = filesExist(iosIconAssets)
addCheck({
  id: 'tauri.ios_icon_assets',
  platform: 'ios',
  status: hasIosIconAssets ? 'pass' : 'warn',
  summary: hasIosIconAssets ? 'iOS AppIcon assets are present.' : 'iOS AppIcon assets are incomplete.',
  detail: 'iPhone/iPad builds require the generated AppIcon asset set before device packaging.'
})

const iosProjectPath = path.join(TAURI_DIR, 'gen/apple/project.yml')
const iosInfoPlistPath = path.join(TAURI_DIR, 'gen/apple/kmoe-app_iOS/Info.plist')
const iosProject = existsSync(iosProjectPath) ? await readFile(iosProjectPath, 'utf8') : ''
const iosInfoPlist = existsSync(iosInfoPlistPath) ? await readFile(iosInfoPlistPath, 'utf8') : ''
const iosFileSharingReady = [
  'CFBundleDisplayName: kmoelite',
  'LSSupportsOpeningDocumentsInPlace: true',
  'UIFileSharingEnabled: true'
].every((marker) => iosProject.includes(marker)) &&
  [
    '<key>CFBundleDisplayName</key>',
    '<string>kmoelite</string>',
    '<key>LSSupportsOpeningDocumentsInPlace</key>',
    '<true/>',
    '<key>UIFileSharingEnabled</key>'
  ].every((marker) => iosInfoPlist.includes(marker))
addCheck({
  id: 'tauri.ios_file_export_metadata',
  platform: 'ios',
  status: iosFileSharingReady ? 'pass' : 'warn',
  summary: iosFileSharingReady ? 'iOS display name and file-export metadata are preserved.' : 'iOS file-export metadata is incomplete.',
  detail: 'iPhone/iPad explicit downloads rely on the generated Info.plist and XcodeGen project keeping document opening and file sharing enabled.'
})

const androidProjectFiles = [
  'gen/android/app/build.gradle.kts',
  'gen/android/app/src/main/AndroidManifest.xml',
  'gen/android/gradlew',
  'gen/schemas/android-schema.json'
]
const hasAndroidProjectFiles = filesExist(androidProjectFiles)
addCheck({
  id: 'tauri.android_project',
  platform: 'android',
  status: hasAndroidProjectFiles ? 'pass' : 'warn',
  summary: hasAndroidProjectFiles ? 'Android Tauri project files are present.' : 'Android Tauri project files are incomplete.',
  detail: 'Android source builds need the generated Gradle project, manifest, wrapper, and Android capability schema.'
})

const androidManifestPath = path.join(TAURI_DIR, 'gen/android/app/src/main/AndroidManifest.xml')
const androidManifest = existsSync(androidManifestPath) ? await readFile(androidManifestPath, 'utf8') : ''
addCheck({
  id: 'tauri.android_tv_manifest',
  platform: 'android-tv',
  status: androidManifest.includes('android.software.leanback') && androidManifest.includes('android.intent.category.LEANBACK_LAUNCHER') ? 'pass' : 'warn',
  summary: androidManifest ? 'Android manifest declares optional Leanback launcher support.' : 'Android manifest is missing.',
  detail: 'Android TV install/launcher smoke needs the optional leanback feature and LEANBACK_LAUNCHER category before emulator/device validation.'
})

addCommandCheck('macos.hdiutil', 'macos', 'hdiutil', ['help'], 'macOS DMG tooling is available.', { activeOnlyOn: 'darwin' })
addCommandCheck('macos.codesign', 'macos', 'xcrun', ['-find', 'codesign'], 'macOS codesign command is discoverable through xcrun.', { activeOnlyOn: 'darwin' })
addCommandCheck('macos.homebrew', 'macos', 'brew', ['--version'], 'Homebrew is available for Tauri mobile helper tools such as libimobiledevice.', {
  activeOnlyOn: 'darwin',
  missingStatus: 'external'
})
addCommandCheck('macos.xcodebuild', 'macos', 'xcodebuild', ['-version'], 'Full Xcode is available for signing/mobile workflows.', {
  activeOnlyOn: 'darwin',
  missingStatus: 'external'
})

const xcodeSelect = commandOutput('xcode-select', ['-p'])
addCheck({
  id: 'macos.xcode_selected',
  platform: 'macos',
  status: hostPlatform !== 'darwin' ? 'external' : xcodeSelect.ok && !xcodeSelect.stdout.includes('CommandLineTools') ? 'pass' : 'external',
  summary: hostPlatform === 'darwin' && xcodeSelect.stdout ? xcodeSelect.stdout : 'Full Xcode path not confirmed.',
  detail: 'Apple signing and iOS/iPadOS device builds require full Xcode, not only Command Line Tools.'
})

const xcodeSdks = commandOutput('xcodebuild', ['-showsdks'])
const tvosSdkName = xcodeSdks.stdout.match(/-sdk\s+(appletvos[^\s]+)/)?.[1]
addCheck({
  id: 'appletv.tvos_sdk',
  platform: 'appletv',
  status: hostPlatform !== 'darwin' ? 'external' : xcodeSdks.ok && tvosSdkName ? 'pass' : 'external',
  summary: hostPlatform === 'darwin' && tvosSdkName ? `${tvosSdkName} available` : 'tvOS SDK check requires macOS/Xcode.',
  detail: 'Apple TV validation needs the tvOS SDK before any native TV shell or simulator build can be verified.'
})

const tvosSimulatorSdkPath = commandOutput('xcrun', ['--sdk', 'appletvsimulator', '--show-sdk-path'])
const tvosWebKitPath = path.join(tvosSimulatorSdkPath.stdout.trim(), 'System', 'Library', 'Frameworks', 'WebKit.framework')
const tvosHasWebKit = tvosSimulatorSdkPath.ok && existsSync(tvosWebKitPath)
addCheck({
  id: 'appletv.webkit_unavailable',
  platform: 'appletv',
  status: hostPlatform !== 'darwin' ? 'external' : tvosSimulatorSdkPath.ok && !tvosHasWebKit ? 'warn' : 'pass',
  summary: hostPlatform === 'darwin' && tvosSimulatorSdkPath.ok
    ? tvosHasWebKit
      ? 'WebKit.framework is available in the tvOS simulator SDK.'
      : 'WebKit.framework is not available in the tvOS simulator SDK.'
    : 'tvOS simulator SDK path not confirmed.',
  detail: 'Apple TV cannot reuse the current Tauri/WKWebView app shell unless the platform provides WebKit; current work needs TVMLKit, TVUIKit, or a native TV UI plan.'
})

const simctlRuntimes = commandOutput('xcrun', ['simctl', 'list', 'runtimes'])
const hasTvosRuntime = /com\.apple\.CoreSimulator\.SimRuntime\.tvOS|tvOS/i.test(simctlRuntimes.stdout)
addCheck({
  id: 'appletv.tvos_sim_runtime',
  platform: 'appletv',
  status: hostPlatform !== 'darwin' ? 'external' : simctlRuntimes.ok && hasTvosRuntime ? 'pass' : 'external',
  summary: hostPlatform === 'darwin' && simctlRuntimes.ok && hasTvosRuntime ? 'tvOS simulator runtime is installed.' : 'tvOS simulator runtime not installed.',
  detail: 'Apple TV simulator smoke needs an installed tvOS runtime, not only SDK headers.'
})

const simctlDeviceTypes = commandOutput('xcrun', ['simctl', 'list', 'devicetypes'])
addCheck({
  id: 'appletv.sim_device_type',
  platform: 'appletv',
  status: hostPlatform !== 'darwin' ? 'external' : simctlDeviceTypes.ok && /Apple TV/.test(simctlDeviceTypes.stdout) ? 'pass' : 'external',
  summary: hostPlatform === 'darwin' && simctlDeviceTypes.ok && /Apple TV/.test(simctlDeviceTypes.stdout) ? 'Apple TV simulator device types are available.' : 'Apple TV simulator device type not confirmed.',
  detail: 'Apple TV simulator smoke needs an Apple TV CoreSimulator device type.'
})

const simctlDevices = commandOutput('xcrun', ['simctl', 'list', 'devices', 'available'])
addCheck({
  id: 'appletv.sim_device_available',
  platform: 'appletv',
  status: hostPlatform !== 'darwin' ? 'external' : simctlDevices.ok && /Apple TV/.test(simctlDevices.stdout) ? 'pass' : 'external',
  summary: hostPlatform === 'darwin' && simctlDevices.ok && /Apple TV/.test(simctlDevices.stdout) ? 'Apple TV simulator devices are available.' : 'Apple TV simulator device not confirmed.',
  detail: 'Apple TV simulator smoke needs an actual available simulator device after the tvOS runtime is installed.'
})

addCommandCheck('windows.sign_tool', 'windows', 'signtool', [], 'Windows Authenticode signing tool is available.', {
  activeOnlyOn: 'win32',
  missingStatus: 'external'
})
addCommandCheck('windows.nsis', 'windows', 'makensis', ['-VERSION'], 'NSIS installer tooling is available.', {
  activeOnlyOn: 'win32',
  missingStatus: 'external'
})

for (const target of ['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios']) {
  addCheck({
    id: `ios.rust_target.${target}`,
    platform: 'ios',
    status: installedRustTargets.includes(target) ? 'pass' : 'external',
    summary: installedRustTargets.includes(target) ? `${target} installed` : `${target} not installed`,
    detail: 'iOS/iPadOS validation needs the relevant Rust target plus full Xcode and provisioning.'
  })
}

for (const target of ['aarch64-apple-tvos', 'aarch64-apple-tvos-sim']) {
  addCheck({
    id: `appletv.rust_target.${target}`,
    platform: 'appletv',
    status: installedRustTargets.includes(target) ? 'pass' : 'external',
    summary: installedRustTargets.includes(target) ? `${target} installed` : `${target} not installed`,
    detail: 'Apple TV validation needs tvOS Rust targets before any Rust-backed tvOS shell can be built.'
  })
}

for (const target of ['aarch64-linux-android', 'armv7-linux-androideabi', 'i686-linux-android', 'x86_64-linux-android']) {
  addCheck({
    id: `android.rust_target.${target}`,
    platform: 'android',
    status: installedRustTargets.includes(target) ? 'pass' : 'external',
    summary: installedRustTargets.includes(target) ? `${target} installed` : `${target} not installed`,
    detail: 'Android APK/AAB validation needs the relevant Rust targets plus Android SDK/NDK.'
  })
}

addCommandCheck('android.adb', 'android', 'adb', ['version'], 'ADB is available for Android emulator/device installation smoke.', {
  missingStatus: 'external'
})
addCommandCheck('android.sdkmanager', 'android', 'sdkmanager', ['--version'], 'Android SDK manager is available for installing SDK/NDK/system images.', {
  missingStatus: 'external'
})
addCommandCheck('android.avdmanager', 'android', 'avdmanager', ['list', 'device'], 'Android AVD manager is available for emulator profile management.', {
  missingStatus: 'external'
})
addCommandCheck('android.emulator', 'android', 'emulator', ['-version'], 'Android emulator is available for local smoke runs.', {
  missingStatus: 'external'
})

addCommandCheck('ios.simctl', 'ios', 'xcrun', ['simctl', 'help'], 'iOS simulator control is available.', {
  activeOnlyOn: 'darwin',
  missingStatus: 'external'
})
addCommandCheck('ios.xcodegen', 'ios', 'xcodegen', ['--version'], 'XcodeGen is available for Tauri iOS project generation.', {
  activeOnlyOn: 'darwin',
  missingStatus: 'external'
})
addCommandCheck('ios.cocoapods', 'ios', 'pod', ['--version'], 'CocoaPods is available for Tauri iOS dependency installation.', {
  activeOnlyOn: 'darwin',
  missingStatus: 'external'
})
addCommandCheck('ios.libimobiledevice', 'ios', 'idevice_id', ['--help'], 'libimobiledevice is available for device discovery used by Tauri iOS tooling.', {
  activeOnlyOn: 'darwin',
  missingStatus: 'external'
})

const summary = summarize(checks)
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  host: {
    platform: hostPlatform,
    arch: process.arch,
    release: os.release()
  },
  app: {
    productName: tauriConfig.productName,
    identifier: tauriConfig.identifier,
    version: tauriConfig.version
  },
  safety: {
    realDownloadsExecuted: false,
    credentials: 'omitted',
    cookies: 'omitted',
    authorizationUrls: 'omitted'
  },
  summary,
  checks
}

const reportJson = `${JSON.stringify(report, null, 2)}\n`
assertNoSensitiveText(reportJson)

const outputPath = outputArg
  ? path.resolve(ROOT_DIR, outputArg)
  : path.join(TAURI_DIR, 'target', 'platform-readiness.json')
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, reportJson)

console.log(`platform_readiness=${path.relative(ROOT_DIR, outputPath)} pass=${summary.pass} warn=${summary.warn} external=${summary.external} fail=${summary.fail}`)

if (summary.fail > 0) {
  process.exit(1)
}

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

function addCheck(check) {
  checks.push(check)
}

function addScriptCheck(id, platform, pkg, scriptName) {
  const script = pkg.scripts?.[scriptName]
  addCheck({
    id,
    platform,
    status: script ? 'pass' : 'warn',
    summary: script ? `${scriptName}: ${script}` : `${scriptName} missing`,
    detail: 'Package scripts are the stable entrypoints for local and CI verification.'
  })
}

function addCommandCheck(id, platform, command, args, detail, options = {}) {
  if (options.activeOnlyOn && options.activeOnlyOn !== hostPlatform) {
    addCheck({
      id,
      platform,
      status: options.missingStatus ?? 'external',
      summary: `${command} check is for ${options.activeOnlyOn}; host is ${hostPlatform}.`,
      detail
    })
    return
  }

  const result = commandOutput(command, args)
  addCheck({
    id,
    platform,
    status: result.ok ? 'pass' : options.missingStatus ?? 'warn',
    summary: result.ok ? firstLine(result.stdout || result.stderr || `${command} available`) : firstLine(result.stderr || result.stdout || `${command} unavailable`),
    detail
  })
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: commandEnv(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim()
  }
}

function commandEnv() {
  const pathValue = process.env.PATH ?? ''
  const extraPath = EXTRA_BIN_DIRS.filter((dir) => existsSync(dir)).join(path.delimiter)
  return {
    ...process.env,
    PATH: extraPath ? `${extraPath}${path.delimiter}${pathValue}` : pathValue
  }
}

function firstLine(text) {
  return String(text).split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? ''
}

function hasIcon(config, icon) {
  return Array.isArray(config.bundle?.icon) && config.bundle.icon.includes(icon)
}

function filesExist(relativePaths) {
  return relativePaths.every((relativePath) => existsSync(path.join(TAURI_DIR, relativePath)))
}

function summarize(items) {
  return items.reduce(
    (acc, item) => {
      acc[item.status] += 1
      return acc
    },
    { pass: 0, warn: 0, external: 0, fail: 0 }
  )
}

function assertNoSensitiveText(text) {
  const forbidden = [
    /getdownurl\.php/i,
    /set-cookie:/i,
    /authorization:\s*bearer/i,
    new RegExp(`${'session'}=[a-z0-9_%.-]{12,}`, 'i'),
    new RegExp(`${'token'}=[a-z0-9_%.-]{12,}`, 'i'),
    new RegExp(`${'password'}=[^ <\`"']{8,}`, 'i')
  ]
  if (forbidden.some((pattern) => pattern.test(text))) {
    throw new Error('Platform readiness report contains sensitive or temporary authorization data.')
  }
}

async function selfTest() {
  const sample = summarize([
    { status: 'pass' },
    { status: 'warn' },
    { status: 'external' },
    { status: 'fail' }
  ])
  if (sample.pass !== 1 || sample.warn !== 1 || sample.external !== 1 || sample.fail !== 1) {
    throw new Error('summary self-test failed')
  }
  if (readArgFrom(['--output=report.json'], '--output') !== 'report.json') {
    throw new Error('equals-style argument self-test failed')
  }
  if (readArgFrom(['--output', 'report.json'], '--output') !== 'report.json') {
    throw new Error('space-style argument self-test failed')
  }
  if (readArgFrom(['--', '--output', 'report.json'], '--output') !== 'report.json') {
    throw new Error('pnpm passthrough argument self-test failed')
  }
  assertNoSensitiveText(JSON.stringify({ safe: true }))
  console.log('platform_readiness_self_test=ok')
}
