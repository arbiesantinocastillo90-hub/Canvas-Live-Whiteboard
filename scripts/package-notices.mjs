import { copyFile, readFile, writeFile } from 'node:fs/promises'

const dependencyNotices = await readFile(
  new URL('../docs/THIRD_PARTY_NOTICES.md', import.meta.url),
  'utf8',
)
const clientMarks = await readFile(
  new URL('../public/assets/ai-clients/NOTICE.txt', import.meta.url),
  'utf8',
)

await Promise.all([
  copyFile(
    new URL('../LICENSE', import.meta.url),
    new URL('../dist/LICENSE.txt', import.meta.url),
  ),
  writeFile(
    new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url),
    dependencyNotices + '\n\n---\n\n' + clientMarks,
  ),
])
