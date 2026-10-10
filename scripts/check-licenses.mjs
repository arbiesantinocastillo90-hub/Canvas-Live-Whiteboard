import { readFile, writeFile } from 'node:fs/promises'

// Inspect the resolved dependency graph, including optional platform packages.
const lock = JSON.parse(
  await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
)
const accepted = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Unlicense',
  'Python-2.0',
])
const packages = Object.entries(lock.packages)
  .filter(([path]) => path !== '')
  .map(([path, entry]) => {
    const identifiers = (entry.license ?? '').match(/[A-Za-z0-9.-]+/g) ?? []
    const terms = identifiers.filter((term) => term !== 'AND' && term !== 'OR')
    const validCharacters = /^[A-Za-z0-9.()\s-]+$/.test(entry.license ?? '')
    const permitted =
      (validCharacters &&
        terms.length > 0 &&
        terms.every((term) => accepted.has(term))) ||
      // Attribution-only browser support data, reviewed at this exact version.
      (path === 'node_modules/caniuse-lite' &&
        entry.version === '1.0.30001815' &&
        entry.license === 'CC-BY-4.0')
    return {
      path,
      version: entry.version,
      license: entry.license ?? 'UNKNOWN',
      developmentOnly: entry.dev === true,
      optional: entry.optional === true,
      permitted,
    }
  })
  .sort((left, right) => left.path.localeCompare(right.path))

const report = {
  source: 'package-lock.json',
  note: 'SPDX metadata review only; retain actual license notices for distributed code and assets.',
  packages,
}
await writeFile(
  new URL('../docs/license-inventory.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
)
const notices = [
  '# Production dependency notices\n',
  'Generated from installed production dependencies. Retain these license texts when distributing the app.\n',
]
const missingNotices = []
const incompleteEntries = Object.entries(lock.packages).filter(
  ([path, entry]) => path !== '' && (!entry.resolved || !entry.integrity),
)
for (const entry of packages.filter(
  (pkg) => !pkg.developmentOnly && !pkg.optional,
)) {
  let licenseText
  for (const file of [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'license',
    'license.md',
  ]) {
    try {
      licenseText = await readFile(
        new URL(`../${entry.path}/${file}`, import.meta.url),
        'utf8',
      )
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  if (!licenseText) {
    missingNotices.push(entry.path)
    continue
  }
  notices.push(
    `## ${entry.path.replace(/^node_modules\//, '')} ${entry.version}\n\n\`\`\`text\n${licenseText.trim()}\n\`\`\`\n`,
  )
}
await writeFile(
  new URL('../docs/THIRD_PARTY_NOTICES.md', import.meta.url),
  notices.join('\n'),
)
const dataLicense = await readFile(
  new URL('../node_modules/caniuse-lite/LICENSE', import.meta.url),
  'utf8',
)
await writeFile(
  new URL('../docs/DATA_NOTICES.md', import.meta.url),
  [
    '# Development data notice\n',
    'caniuse-lite 1.0.30001815, by Ben Briggs and the Browserslist contributors, contains browser support data derived from Can I Use.\n',
    'Sources: https://github.com/browserslist/caniuse-lite and https://caniuse.com/. License: https://creativecommons.org/licenses/by/4.0/.\n',
    'The installed package is used unchanged by development tooling. It is not included in the application bundle. Keep this attribution and the license below if redistributing that package or its data.\n',
    `\`\`\`text\n${dataLicense.trim().replace(/[ \t]+$/gm, '')}\n\`\`\`\n`,
  ].join('\n'),
)
const flagged = packages.filter((entry) => !entry.permitted)
if (flagged.length || missingNotices.length || incompleteEntries.length) {
  for (const [path] of incompleteEntries)
    console.error(`Missing lockfile URL or integrity checksum: ${path}`)
  for (const entry of flagged)
    console.error(`${entry.path}@${entry.version}: ${entry.license}`)
  for (const path of missingNotices)
    console.error(`Missing production license notice: ${path}`)
  process.exitCode = 1
} else {
  console.log(
    `License metadata checked: ${packages.length} resolved packages; no unreviewed licenses.`,
  )
}
