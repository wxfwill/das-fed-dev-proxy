import { execa } from 'execa'
import { loadProxyConfig } from './config.js'
import { startDevProxy } from './server.js'

const exitCodeForSignal = (signal) => (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)

const killTree = (child, signal) => new Promise((resolve) => {
  if (!child.pid || child.exitCode !== null || child.killed) return resolve()
  if (process.platform === 'win32') {
    execa('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', reject: false })
      .finally(resolve)
    return
  }
  try { process.kill(-child.pid, signal) } catch (error) {
    if (error.code !== 'ESRCH') child.kill(signal)
  }
  resolve()
})

export const runWithProxy = async ({ config: configInput, configPath, commands, cwd = process.cwd(), env = process.env }) => {
  if (!Array.isArray(commands) || commands.length === 0) throw new Error('runWithProxy requires at least one command')

  const config = typeof configInput === 'string'
    ? await loadProxyConfig(configInput, cwd)
    : configInput || await loadProxyConfig(configPath, cwd)
  const proxy = await startDevProxy(config)
  const children = []
  let stopping
  let receivedSignal

  const stopChildren = (signal = 'SIGTERM') => {
    if (stopping) return stopping
    stopping = Promise.all(children.map((child) => killTree(child, signal)))
    return stopping
  }
  const onSigint = () => {
    receivedSignal = 'SIGINT'
    void stopChildren('SIGINT')
  }
  const onSigterm = () => {
    receivedSignal = 'SIGTERM'
    void stopChildren('SIGTERM')
  }
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  try {
    const results = commands.map(({ command, args = [], cwd: commandCwd = cwd, env: commandEnv = env, name }) => {
      if (typeof command !== 'string' || command.length === 0 || !Array.isArray(args)) {
        throw new Error(`Invalid command definition${name ? ` for ${name}` : ''}`)
      }
      const child = execa(command, args, {
        cwd: commandCwd,
        env: commandEnv,
        stdio: 'inherit',
        reject: false,
        detached: process.platform !== 'win32',
      })
      children.push(child)
      return child.then(({ exitCode, signal, failed }) => ({
        exitCode: Number.isInteger(exitCode) ? exitCode : exitCodeForSignal(signal),
        failed,
        signal,
      }))
    })
    let firstFailure
    for (const result of results) {
      void result.then((outcome) => {
        if (outcome.exitCode !== 0 && !firstFailure) {
          firstFailure = outcome
          void stopChildren()
        }
      })
    }
    const outcomes = await Promise.all(results)
    return receivedSignal
      ? exitCodeForSignal(receivedSignal)
      : firstFailure?.exitCode ?? outcomes.find(({ exitCode }) => exitCode !== 0)?.exitCode ?? 0
  } catch (error) {
    await stopChildren()
    throw error
  } finally {
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
    await proxy.close()
  }
}
