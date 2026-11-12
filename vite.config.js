import { resolve } from 'node:path'

export default {
  build: {
    target: 'node18',
    lib: {
      entry: {
        index: resolve('src/index.js'),
        cli: resolve('src/cli.js'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['execa', 'http-proxy', /^node:/],
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
}
