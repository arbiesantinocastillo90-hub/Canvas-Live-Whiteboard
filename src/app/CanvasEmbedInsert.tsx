import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EMBED_KINDS, validEmbedSource, type EmbedKind } from './lcanvas'
import { saveCanvasMedia } from './canvasMedia'

export default function CanvasEmbedInsert({
  onInsert,
}: {
  onInsert: (kind: EmbedKind, src: string, title: string) => void
}) {
  const [kind, setKind] = useState<EmbedKind>('web')
  const [src, setSrc] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!validEmbedSource(src.trim()) || src.startsWith('media:')) {
      setError('Enter an HTTPS URL, or choose a local file.')
      return
    }
    onInsert(kind, src.trim(), title.trim())
  }
  return (
    <div className="canvas-embed-insert">
      <form onSubmit={submit}>
        <label className="inspector-field">
          <span>Embed type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EmbedKind)}
          >
            {EMBED_KINDS.map((v) => (
              <option key={v} value={v}>
                {v === 'web'
                  ? 'Website'
                  : v === 'document'
                    ? 'Document / PDF'
                    : v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="inspector-field">
          <span>Embed URL</span>
          <input
            type="url"
            placeholder="https://…"
            value={src}
            maxLength={4096}
            onChange={(e) => setSrc(e.target.value)}
          />
        </label>
        <label className="inspector-field">
          <span>Embed title</span>
          <input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || !src.trim()}>
          Add embed
        </button>
      </form>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Importing…' : 'Choose local media or PDF'}
      </button>
      <input
        hidden
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,application/pdf,text/plain,text/markdown,text/csv,.md,.csv,.log"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          setError('')
          try {
            const ref = await saveCanvasMedia(file)
            if (!mounted.current) return
            const type: EmbedKind =
              file.type === 'image/gif'
                ? 'gif'
                : file.type.startsWith('image/')
                  ? 'image'
                  : file.type.startsWith('video/')
                    ? 'video'
                    : file.type.startsWith('audio/')
                      ? 'audio'
                      : 'document'
            onInsert(type, ref, title.trim() || file.name.slice(0, 120))
          } catch (cause) {
            if (!mounted.current) return
            setError(
              cause instanceof Error
                ? cause.message
                : 'The media could not be imported.',
            )
          } finally {
            if (mounted.current) setBusy(false)
          }
        }}
      />
      <small>
        Local files stay in this library. Some websites prevent embedding; use
        their share or embed URL. External content loads when you resume its
        frame.
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
