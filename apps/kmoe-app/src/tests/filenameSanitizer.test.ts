import { describe, expect, it } from 'vitest'
import { buildLocalFilename, preventPathTraversal, sanitizeFilename } from '../lib/sanitize'

describe('filename sanitizer', () => {
  it('removes unsafe characters and reserved names', () => {
    expect(sanitizeFilename('A/B:C*D?.mobi')).toBe('A_B_C_D_.mobi')
    expect(sanitizeFilename('CON')).toBe('CON_file')
    expect(sanitizeFilename('CON.txt')).toBe('_CON.txt')
    expect(sanitizeFilename('lpt1.epub')).toBe('_lpt1.epub')
  })

  it('prevents path traversal and builds local filenames', () => {
    expect(preventPathTraversal('../bad/../../safe:name')).toBe('bad/safe_name')
    expect(buildLocalFilename({ comicTitle: '尖帽子/魔法', volumeTitle: '話 001-006', format: 'mobi' })).toBe('尖帽子_魔法 - 話 001-006.mobi')
  })
})
