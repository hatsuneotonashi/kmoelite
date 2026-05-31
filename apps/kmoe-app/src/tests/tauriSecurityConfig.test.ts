import { describe, expect, it } from 'vitest'
import mainCapability from '../../src-tauri/capabilities/main.json'
import tauriConfig from '../../src-tauri/tauri.conf.json'

describe('Tauri security configuration', () => {
  it('pins IPC access to the named local main window', () => {
    expect(tauriConfig.app.windows[0]?.label).toBe('main')
    expect(mainCapability.identifier).toBe('main-window')
    expect(mainCapability.local).toBe(true)
    expect(mainCapability).not.toHaveProperty('remote')
    expect(mainCapability.windows).toEqual(['main'])
    expect(mainCapability.windows).not.toContain('*')
    expect(mainCapability.permissions).toContain('core:default')
  })

  it('does not grant broad plugin file, shell, dialog, or HTTP permissions', () => {
    const permissionText = JSON.stringify(mainCapability.permissions)

    expect(permissionText).not.toContain('fs:default')
    expect(permissionText).not.toContain('shell:default')
    expect(permissionText).not.toContain('dialog:default')
    expect(permissionText).not.toContain('http:default')
    expect(permissionText).not.toContain('opener:default')
  })

  it('uses an explicit CSP for the packaged app', () => {
    const csp = tauriConfig.app.security.csp

    expect(typeof csp).toBe('string')
    expect(csp).not.toContain('* ')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'none'")
  })

  it('keeps live network access narrow and preserves Tauri IPC', () => {
    const csp = tauriConfig.app.security.csp
    const connectSrc = readDirective(csp, 'connect-src')

    expect(connectSrc).toContain('ipc:')
    expect(connectSrc).toContain('http://ipc.localhost')
    expect(connectSrc).toContain('https://kzo.moe')
    expect(connectSrc).not.toContain('https:')
    expect(connectSrc).not.toContain('http:')
  })
})

function readDirective(csp: string, directive: string): string[] {
  const entry = csp
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${directive} `))
  return entry?.split(/\s+/).slice(1) ?? []
}
