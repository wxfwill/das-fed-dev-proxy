import { loadProxyConfig } from './config.js'
import { startDevProxy } from './server.js'
import { runWithProxy } from './runner.js'

const usage = () => {
  console.log('Usage: das-dev-proxy serve --config <file>')
  console.log('       das-dev-proxy run --config <file> -- <command> [args...]')
}

const parseArgs = (args) => {
  const [mode, ...rest] = args
  const separator = rest.indexOf('--')
  const optionArgs = separator < 0 ? rest : rest.slice(0, separator)
  const command = separator < 0 ? [] : rest.slice(separator + 1)
  let configPath

  for (let index = 0; index < optionArgs.length; index += 1) {
    const value = optionArgs[index]
    if (value === '--config') {
      configPath = optionArgs[index + 1]
      index += 1
    } else if (value.startsWith('--config=')) {
      configPath = value.slice('--config='.length)
    } else {
      throw new Error(`Unknown option: ${value}`)
    }
  }
  return { mode, configPath, command }
}

export const main = async (args = process.argv.slice(2)) => {
  try {
    const { mode, configPath, command } = parseArgs(args)
    if (!['serve', 'run'].includes(mode) || !configPath) {
      usage()
      return 2
    }
    const config = await loadProxyConfig(configPath)

    if (mode === 'serve') {
      const server = await startDevProxy(config)
      console.log(`Dev proxy listening on http://${server.address.address}:${server.address.port}`)
      return await new Promise((resolve) => {
        const close = async (code) => {
          process.removeListener('SIGINT', onSigint)
          process.removeListener('SIGTERM', onSigterm)
          await server.close()
          resolve(code)
        }
        const onSigint = () => void close(130)
        const onSigterm = () => void close(143)
        process.once('SIGINT', onSigint)
        process.once('SIGTERM', onSigterm)
      })
    }

    if (command.length === 0) throw new Error('run requires a command after --')
    return await runWithProxy({ config, commands: [{ command: command[0], args: command.slice(1) }] })
  } catch (error) {
    console.error(`[dev-proxy] ${error.message}`)
    return 1
  }
}
