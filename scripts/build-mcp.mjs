import { build } from 'esbuild'

await build({
  entryPoints: ['server/main.ts'],
  outfile: 'dist-mcp/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: false,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
})
console.log('Built the local Canvas Live MCP companion.')
