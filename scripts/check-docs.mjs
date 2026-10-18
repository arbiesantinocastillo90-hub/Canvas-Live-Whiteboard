import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const ignored = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-mcp',
  'release',
  'test-results',
  '.canvas-live',
])
async function markdownFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await markdownFiles(target)))
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target)
  }
  return files
}

const failures = []
let links = 0
const files = await markdownFiles(root)
for (const file of files) {
  const content = await readFile(file, 'utf8')
  // Match inline Markdown destinations, including image destinations. External
  // links and same-page anchors are outside this local-file check.
  for (const match of content.matchAll(
    /!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/gu,
  )) {
    const destination = match[1].replace(/^<|>$/gu, '')
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/iu.test(destination)) continue
    const local = decodeURIComponent(destination.split(/[?#]/u)[0])
    const target = path.resolve(path.dirname(file), local)
    if (!target.startsWith(root)) {
      failures.push(`${path.relative(root, file)}: path leaves repository`)
      continue
    }
    links++
    try {
      await access(target)
    } catch {
      failures.push(`${path.relative(root, file)}: missing ${destination}`)
    }
  }
}

const validator = await build({
  stdin: {
    contents: "export { validateCanvasDocument } from './src/app/lcanvas.ts'",
    resolveDir: root,
    sourcefile: 'documentation-validator.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(validator.outputFiles[0].contents).toString('base64')}`
const { validateCanvasDocument } = await import(moduleUrl)
const demo = JSON.parse(
  await readFile(path.join(root, 'examples/portfolio-demo.CLF'), 'utf8'),
)
validateCanvasDocument(demo)

if (failures.length) {
  failures.forEach((failure) => process.stderr.write(failure + '\n'))
  process.exitCode = 1
} else {
  process.stdout.write(
    `${files.length} Markdown files; ${links} local links resolved; portfolio demo validates.\n`,
  )
}
