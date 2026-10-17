import { useRef, useState, type ChangeEvent } from 'react'
import Icon from './Icon'
import { useSessionNotifications } from './notificationSession'
import {
  parseProjectArchive,
  projectExportFilename,
  PROJECT_ARCHIVE_MAX_BYTES,
  PROJECT_FILE_ACCEPT,
  serializeProjectArchive,
  type ProjectArchive,
} from './projectArchive'
import './project-transfer.css'

export type ProjectTransferProps = {
  onExport: () => Promise<ProjectArchive>
  onImport: (archive: ProjectArchive) => Promise<void>
  disabled?: boolean
  exportDisabled?: boolean
  scopeId?: string
}

export default function ProjectTransfer({
  onExport,
  onImport,
  disabled = false,
  exportDisabled = false,
  scopeId = 'projects',
}: ProjectTransferProps) {
  const input = useRef<HTMLInputElement>(null)
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const { notify } = useSessionNotifications(scopeId)
  async function action(work: () => Promise<void>) {
    if (disabled || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await work()
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'The project file could not be opened or exported.',
        'error',
      )
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    await action(async () => {
      if (file.size > PROJECT_ARCHIVE_MAX_BYTES)
        throw new Error('The .CLP file exceeds 25 MiB.')
      const archive = parseProjectArchive(await file.text())
      await onImport(archive)
      notify('Project imported (.CLP).', 'success')
    })
  }
  async function exportFile() {
    if (exportDisabled) return
    await action(async () => {
      const archive = await onExport()
      const raw = serializeProjectArchive(archive)
      const root = archive.projects.find(
        (project) => project.id === archive.rootProjectId,
      )!
      const url = URL.createObjectURL(
        new Blob([raw], { type: 'application/json' }),
      )
      const revoke = URL.revokeObjectURL.bind(URL)
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = projectExportFilename(root.name)
        link.hidden = true
        document.body.append(link)
        link.click()
        notify('Project copy requested (.CLP).', 'success')
      } finally {
        link.remove()
        setTimeout(() => revoke(url), 1000)
      }
    })
  }
  return (
    <div
      className="project-transfer"
      role="group"
      aria-label="Project files"
      aria-busy={busy}
    >
      <button
        type="button"
        className="icon-button"
        title="Import project (.CLP)"
        aria-label="Import project"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        <Icon name="import" />
      </button>
      <button
        type="button"
        className="icon-button"
        title="Export project (.CLP)"
        aria-label="Export project"
        disabled={disabled || exportDisabled || busy}
        onClick={() => {
          void exportFile()
        }}
      >
        <Icon name="export" />
      </button>
      <input
        ref={input}
        type="file"
        accept={PROJECT_FILE_ACCEPT}
        hidden
        aria-label="Import project file"
        disabled={disabled || busy}
        onChange={(event) => {
          void importFile(event)
        }}
      />
    </div>
  )
}
