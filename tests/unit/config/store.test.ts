import fs from 'fs'
import os from 'os'
import path from 'path'

// ---- mock electron ---------------------------------------------------------
// Must be declared before importing the module under test

let mockUserDataPath = path.join(os.tmpdir(), 'gc-config-test-default')

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((_key: string) => mockUserDataPath),
  },
}))

// ---- import module under test AFTER mock is in place ----------------------

import { loadConfig, saveConfig, updateConfig } from '@main/config/store'

// ---- fixture management ----------------------------------------------------

let testDir: string

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-config-'))
  mockUserDataPath = testDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true })
})

// ---- helpers ---------------------------------------------------------------

function configFilePath(): string {
  return path.join(testDir, 'config.json')
}

// ---- tests -----------------------------------------------------------------

describe('loadConfig', () => {
  it('returns DEFAULT_CONFIG when no config file exists', () => {
    const config = loadConfig()

    expect(config).toHaveProperty('watchRoots')
    expect(config).toHaveProperty('ignoredRepos')
    expect(config).toHaveProperty('ignorePatterns')

    expect(Array.isArray(config.watchRoots)).toBe(true)
    expect(Array.isArray(config.ignoredRepos)).toBe(true)
    expect(Array.isArray(config.ignorePatterns)).toBe(true)
  })

  it('default ignoredRepos is an empty array', () => {
    const config = loadConfig()
    expect(config.ignoredRepos).toEqual([])
  })

  it('default watchRoots contains the user home github directory', () => {
    const config = loadConfig()
    // Default should reference something under homedir
    expect(config.watchRoots.length).toBeGreaterThan(0)
    expect(config.watchRoots[0]).toContain(os.homedir())
  })

  it('default ignorePatterns includes common lock files', () => {
    const config = loadConfig()
    const hasLock = config.ignorePatterns.some(p => p.includes('lock') || p.includes('Lock'))
    expect(hasLock).toBe(true)
  })

  it('returns a new top-level object each call', () => {
    const a = loadConfig()
    const b = loadConfig()
    // Each call should return a distinct object reference
    expect(a).not.toBe(b)
  })

  it('handles corrupted JSON gracefully — returns default', () => {
    fs.writeFileSync(configFilePath(), '{ this is not valid json !!!', 'utf-8')

    const config = loadConfig()

    // Should return default, not throw
    expect(config).toHaveProperty('watchRoots')
    expect(Array.isArray(config.watchRoots)).toBe(true)
  })

  it('handles empty file gracefully — returns default', () => {
    fs.writeFileSync(configFilePath(), '', 'utf-8')

    const config = loadConfig()
    expect(Array.isArray(config.watchRoots)).toBe(true)
  })

  it('loads a saved config correctly', () => {
    const custom = {
      watchRoots: ['/custom/path'],
      ignoredRepos: ['/custom/path/ignored'],
      ignorePatterns: ['*.log'],
    }
    fs.writeFileSync(configFilePath(), JSON.stringify(custom), 'utf-8')

    const loaded = loadConfig()
    expect(loaded.watchRoots).toEqual(['/custom/path'])
    expect(loaded.ignoredRepos).toEqual(['/custom/path/ignored'])
    expect(loaded.ignorePatterns).toEqual(['*.log'])
  })

  it('falls back to defaults for missing array fields in partially valid JSON', () => {
    const partial = { watchRoots: ['/my/root'] }
    fs.writeFileSync(configFilePath(), JSON.stringify(partial), 'utf-8')

    const config = loadConfig()
    expect(config.watchRoots).toEqual(['/my/root'])
    // Missing fields should fall back to defaults (not undefined/null)
    expect(Array.isArray(config.ignoredRepos)).toBe(true)
    expect(Array.isArray(config.ignorePatterns)).toBe(true)
  })

  it('falls back to defaults when a field is not an array', () => {
    const malformed = { watchRoots: 'not-an-array', ignoredRepos: null, ignorePatterns: 42 }
    fs.writeFileSync(configFilePath(), JSON.stringify(malformed), 'utf-8')

    const config = loadConfig()
    expect(Array.isArray(config.watchRoots)).toBe(true)
    expect(Array.isArray(config.ignoredRepos)).toBe(true)
    expect(Array.isArray(config.ignorePatterns)).toBe(true)
  })
})

describe('saveConfig', () => {
  it('writes config.json to the userData path', () => {
    const config = {
      watchRoots: ['/save/path'],
      ignoredRepos: [],
      ignorePatterns: ['*.lock'],
    }

    saveConfig(config)

    expect(fs.existsSync(configFilePath())).toBe(true)
  })

  it('writes valid JSON', () => {
    const config = {
      watchRoots: ['/save/path'],
      ignoredRepos: [],
      ignorePatterns: ['*.lock'],
    }

    saveConfig(config)

    const raw = fs.readFileSync(configFilePath(), 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('written content matches what was saved', () => {
    const config = {
      watchRoots: ['/save/path'],
      ignoredRepos: ['/save/path/ignore-me'],
      ignorePatterns: ['*.lock', '.DS_Store'],
    }

    saveConfig(config)

    const raw = JSON.parse(fs.readFileSync(configFilePath(), 'utf-8'))
    expect(raw.watchRoots).toEqual(config.watchRoots)
    expect(raw.ignoredRepos).toEqual(config.ignoredRepos)
    expect(raw.ignorePatterns).toEqual(config.ignorePatterns)
  })

  it('creates the userData directory if it does not exist', () => {
    const deepPath = path.join(testDir, 'nested', 'deep', 'userData')
    mockUserDataPath = deepPath

    const config = {
      watchRoots: ['/path'],
      ignoredRepos: [],
      ignorePatterns: [],
    }

    expect(() => saveConfig(config)).not.toThrow()
    expect(fs.existsSync(path.join(deepPath, 'config.json'))).toBe(true)

    // Reset
    mockUserDataPath = testDir
  })
})

describe('loadConfig after saveConfig roundtrip', () => {
  it('loadConfig() after saveConfig() returns the same config', () => {
    const original = {
      watchRoots: ['/roundtrip/root'],
      ignoredRepos: ['/roundtrip/root/ignored'],
      ignorePatterns: ['*.min.js', 'dist/**'],
    }

    saveConfig(original)
    const loaded = loadConfig()

    expect(loaded.watchRoots).toEqual(original.watchRoots)
    expect(loaded.ignoredRepos).toEqual(original.ignoredRepos)
    expect(loaded.ignorePatterns).toEqual(original.ignorePatterns)
  })

  it('second saveConfig() call overwrites the first', () => {
    const first = {
      watchRoots: ['/first/path'],
      ignoredRepos: [],
      ignorePatterns: [],
    }
    const second = {
      watchRoots: ['/second/path'],
      ignoredRepos: [],
      ignorePatterns: [],
    }

    saveConfig(first)
    saveConfig(second)

    const loaded = loadConfig()
    expect(loaded.watchRoots).toEqual(['/second/path'])
  })
})

describe('updateConfig', () => {
  it('merges partial watchRoots into the current config', () => {
    saveConfig({
      watchRoots: ['/original'],
      ignoredRepos: [],
      ignorePatterns: ['*.lock'],
    })

    const result = updateConfig({ watchRoots: ['/updated', '/another'] })

    expect(result.watchRoots).toEqual(['/updated', '/another'])
    // Other fields preserved
    expect(result.ignorePatterns).toEqual(['*.lock'])
  })

  it('merges partial ignoredRepos without touching other fields', () => {
    saveConfig({
      watchRoots: ['/root'],
      ignoredRepos: [],
      ignorePatterns: ['*.log'],
    })

    const result = updateConfig({ ignoredRepos: ['/root/skip-me'] })

    expect(result.ignoredRepos).toEqual(['/root/skip-me'])
    expect(result.watchRoots).toEqual(['/root'])
    expect(result.ignorePatterns).toEqual(['*.log'])
  })

  it('merges partial ignorePatterns without touching other fields', () => {
    saveConfig({
      watchRoots: ['/root'],
      ignoredRepos: ['/root/ignore'],
      ignorePatterns: ['*.lock'],
    })

    const result = updateConfig({ ignorePatterns: ['*.log', '*.tmp'] })

    expect(result.ignorePatterns).toEqual(['*.log', '*.tmp'])
    expect(result.watchRoots).toEqual(['/root'])
    expect(result.ignoredRepos).toEqual(['/root/ignore'])
  })

  it('persists the merged config to disk', () => {
    saveConfig({
      watchRoots: ['/original'],
      ignoredRepos: [],
      ignorePatterns: [],
    })

    updateConfig({ watchRoots: ['/new'] })

    const reloaded = loadConfig()
    expect(reloaded.watchRoots).toEqual(['/new'])
  })

  it('handles empty partial update — returns current config unchanged', () => {
    const original = {
      watchRoots: ['/unchanged'],
      ignoredRepos: [],
      ignorePatterns: ['*.lock'],
    }
    saveConfig(original)

    const result = updateConfig({})

    expect(result.watchRoots).toEqual(original.watchRoots)
    expect(result.ignorePatterns).toEqual(original.ignorePatterns)
  })

  it('starts from DEFAULT_CONFIG when no file exists', () => {
    // No prior saveConfig call — file does not exist
    const result = updateConfig({ ignoredRepos: ['/new'] })

    expect(result.ignoredRepos).toEqual(['/new'])
    // watchRoots and ignorePatterns come from defaults
    expect(Array.isArray(result.watchRoots)).toBe(true)
    expect(Array.isArray(result.ignorePatterns)).toBe(true)
  })
})
