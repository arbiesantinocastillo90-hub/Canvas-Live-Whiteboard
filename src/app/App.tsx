export default function App() {
  return (
    <div className="workspace">
      <header className="workspace-header">
        <a className="brand" href="/" aria-label="Canvas Live home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          Canvas Live
        </a>
        <span className="preview-label">Early preview</span>
      </header>

      <main className="workspace-main">
        <section className="introduction" aria-labelledby="workspace-title">
          <p className="eyebrow">A little room for big ideas</p>
          <h1 id="workspace-title">Make space for your thinking.</h1>
          <p className="description">
            Sketch a thought, connect the pieces, and see the bigger picture.
            Your Canvas Live workspace is taking shape.
          </p>
          <div className="connection-status" role="status">
            <span className="status-dot" aria-hidden="true" />
            AI not connected
          </div>
        </section>

        <section className="canvas-preview" aria-label="Workspace preview">
          <div className="canvas-header">
            <span>Your workspace</span>
            <span className="local-label">Local preview</span>
          </div>
          <div className="canvas-placeholder">
            <div className="idea-symbol" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>The first blank page.</h2>
            <p>Drawing tools and board saving are coming next.</p>
          </div>
          <p className="canvas-note">
            This preview is not an editable board yet.
          </p>
        </section>
      </main>

      <footer className="workspace-footer">
        <span>Space to explore. Room to connect.</span>
        <span>Canvas Live · Foundation preview</span>
      </footer>
    </div>
  )
}
