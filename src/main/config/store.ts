import path from 'path'
import fs from 'fs'
import os from 'os'
import { app } from 'electron'
import type { Config } from '../../renderer/types'
import { DEFAULT_COMMIT_PROMPT } from '../claude/commitMessage'

const DEFAULT_CONFIG: Config = {
  watchRoots: [path.join(os.homedir(), 'github')],
  ignoredRepos: [],
  ignorePatterns: ['*.lock', 'package-lock.json', '.DS_Store', 'node_modules/**'],
  commitPrompt: DEFAULT_COMMIT_PROMPT,
  claudeBinaryPath: '',
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): Config {
  const configPath = getConfigPath()
  try {
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIG }
    }
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<Config>
    return {
      watchRoots: Array.isArray(parsed.watchRoots) ? parsed.watchRoots : DEFAULT_CONFIG.watchRoots,
      ignoredRepos: Array.isArray(parsed.ignoredRepos) ? parsed.ignoredRepos : DEFAULT_CONFIG.ignoredRepos,
      ignorePatterns: Array.isArray(parsed.ignorePatterns) ? parsed.ignorePatterns : DEFAULT_CONFIG.ignorePatterns,
      commitPrompt: typeof parsed.commitPrompt === 'string' && parsed.commitPrompt.trim() ? parsed.commitPrompt : DEFAULT_CONFIG.commitPrompt,
      claudeBinaryPath: typeof parsed.claudeBinaryPath === 'string' ? parsed.claudeBinaryPath : DEFAULT_CONFIG.claudeBinaryPath,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function updateConfig(partial: Partial<Config>): Config {
  const current = loadConfig()
  const updated: Config = {
    watchRoots: partial.watchRoots !== undefined ? partial.watchRoots : current.watchRoots,
    ignoredRepos: partial.ignoredRepos !== undefined ? partial.ignoredRepos : current.ignoredRepos,
    ignorePatterns: partial.ignorePatterns !== undefined ? partial.ignorePatterns : current.ignorePatterns,
    commitPrompt: (() => {
      const raw = partial.commitPrompt !== undefined ? partial.commitPrompt : current.commitPrompt
      return raw.trim() ? raw : DEFAULT_COMMIT_PROMPT
    })(),
    claudeBinaryPath: partial.claudeBinaryPath !== undefined ? partial.claudeBinaryPath : current.claudeBinaryPath,
  }
  saveConfig(updated)
  return updated
}
