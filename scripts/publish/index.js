import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { execa } from 'execa'

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const packagePath = path.join(root, 'package.json')
const npmRegistry = 'https://registry.npmjs.org/'

const parseRequestedVersion = (current, requested) => {
  if (!requested) return semver.inc(current, 'patch')
  if (['patch', 'minor', 'major'].includes(requested)) return semver.inc(current, requested)

  const version = semver.valid(requested)
  if (!version || !semver.gt(version, current)) {
    throw new Error(`Requested version must be valid SemVer and greater than ${current}`)
  }
  return version
}

const replaceVersion = async (source, oldVersion, newVersion) => {
  const pattern = /(^\s*"version"\s*:\s*)"[^"]+"/m
  const matches = source.match(new RegExp(pattern.source, 'gm')) || []
  if (matches.length !== 1 || !source.includes(`"version": "${oldVersion}"`)) {
    throw new Error('Cannot safely locate the unique package.json version field')
  }
  await fs.writeFile(packagePath, source.replace(pattern, `$1"${newVersion}"`), 'utf8')
}

const main = async () => {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  if (args.length > 1) throw new Error('Usage: pnpm run publish [patch|minor|major|<semver>]')

  const originalText = await fs.readFile(packagePath, 'utf8')
  const packageInfo = JSON.parse(originalText)
  const currentVersion = packageInfo.version
  const nextVersion = parseRequestedVersion(currentVersion, args[0])
  if (!nextVersion) throw new Error(`Cannot calculate a new version from ${currentVersion}`)

  console.log(`[publish] ${packageInfo.name}: ${currentVersion} -> ${nextVersion}`)
  await execa(process.execPath, [path.join(root, 'scripts/build/index.js')], { cwd: root, stdio: 'inherit' })

  await replaceVersion(originalText, currentVersion, nextVersion)
  let npmrcPath
  try {
    const env = { ...process.env }
    const localNpmrcPath = path.join(root, 'scripts', 'publish', '.npmrc')
    let hasLocalNpmrc = true
    try {
      await fs.access(localNpmrcPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      hasLocalNpmrc = false
    }

    if (hasLocalNpmrc) {
      env.npm_config_userconfig = localNpmrcPath
      console.log('[publish] using scripts/publish/.npmrc for npm authentication')
    } else {
      const token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN
      if (!token) {
        console.log('[publish] using the npm user configuration from npm login')
      } else {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'das-fed-dev-proxy-npm-'))
        npmrcPath = path.join(tempDir, '.npmrc')
        await fs.writeFile(npmrcPath, `//registry.npmjs.org/:_authToken=${token}\n`, { mode: 0o600 })
        env.npm_config_userconfig = npmrcPath
      }
    }

    await execa('npm', ['publish', '--ignore-scripts', '--registry', npmRegistry], {
      cwd: root,
      env,
      stdio: 'inherit',
    })
    console.log(`[publish] published ${packageInfo.name}@${nextVersion}`)
  } catch (error) {
    await replaceVersion(await fs.readFile(packagePath, 'utf8'), nextVersion, currentVersion)
    throw error
  } finally {
    if (npmrcPath) await fs.rm(path.dirname(npmrcPath), { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[publish] ${error.stack || error.message}`)
  process.exitCode = 1
})
