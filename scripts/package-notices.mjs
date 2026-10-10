import { copyFile } from 'node:fs/promises'

await Promise.all([
  copyFile(
    new URL('../LICENSE', import.meta.url),
    new URL('../dist/LICENSE.txt', import.meta.url),
  ),
  copyFile(
    new URL('../docs/THIRD_PARTY_NOTICES.md', import.meta.url),
    new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url),
  ),
])
