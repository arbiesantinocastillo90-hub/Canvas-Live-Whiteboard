# Local folders and recovery

The Windows package keeps its library inside the Canvas Live folder. Creating, importing or duplicating a canvas saves its owned record before opening the new canvas. Workspaces and projects receive their own folders automatically; choosing a separate external `.CLF` is optional.

```text
Canvas Live/
  data/
    library-v2/
      format.json
      projects/<project-id-hash>/
        project.json
        canvases/<canvas-key-hash>.json
        canvases/<canvas-key-hash>.previous.json
      workspaces/<workspace-id-hash>/workspace.json
      records/<record-key-hash>.json
      recovery/
    media/
    appearance/
```

Folder names use stable identifiers so renaming a project or canvas does not move its saved content or create name collisions. The JSON records retain their display names. A workspace descriptor references its projects; two workspaces sharing a project use the same canonical project and canvases.

## Loading and saving

Home reads a lightweight catalog for project counts, canvas names and ordering. Project-only browsing does not download every drawing. Opening a project loads its actual validated canvas records; unchanged bodies can be reused by revision. Requests are bounded and shared between concurrent readers.

Saving one canvas writes that record atomically and keeps its previous copy. It does not rewrite unrelated drawings. Revisions still reject stale saves from another view; this is recovery and conflict protection, not automatic merging of simultaneous edits. Newly created and duplicated canvases are saved immediately. Later edits follow the Save/Autosave setting; drafts remain protected separately.

Keep the complete `data/` folder with the portable package. The JSON record envelopes contain identity and revision information and should not be edited as ordinary `.CLF` exports. Use Import/Export for portable canvas documents.

## Upgrading an existing package

The first launch stages a conversion of `data/library.json`, activates the new storage only after conversion completes, and retains the original library and its previous copy. An interrupted staging folder is not treated as a completed library. The first conversion can take longer than subsequent launches; wait for it to finish or use Retry after a connection timeout.

Valid current records take priority. A damaged current record can recover from its valid previous copy, and valid backup-only legacy records are retained with a recovery notice. Individual unreadable records are isolated so healthy canvases remain accessible. A damaged record is protected against accidental replacement; a warning is a reason to inspect or restore a backup, not to reset the library.

Once new saves have been made, an older executable cannot read those new records from its former monolithic snapshot. Preserve a full package backup before downgrading.

## External file access

An owned Canvas Live record and a separately selected external `.CLF` are different save destinations. Embedded views may block browser file-writing permissions even when the owned library is available.

If an external write is blocked, Canvas Live can retain an owned-library recovery copy without claiming the external file was updated. Save options identify the pending external write, offer a retry and provide Download copy. Automatic external retries pause; enabled owned-library autosaves can continue. Open Canvas Live directly in a supported browser to grant external-file access. Conflicting external edits are preserved.

## Removing and moving items

**Move to Trash** removes an item from the current workspace's view and retains its canonical data. Open that workspace's Trash to restore it. Project removal includes its visible project subtree; another workspace already sharing the project retains its own access. Permanent deletion is not included.

For a move, choose the destination workspace explicitly. Moving a project changes workspace membership while retaining its project and canvas identities. Moving a canvas to another project first saves a destination record, then hides the source reference in the source workspace's Trash. If the target already shares the same canonical project, its existing canvas is retained. A failed destination save leaves the source available; a failed source removal reports that both copies remain. Save open dirty drafts before moving or removing their item. Export a backup if saving is unavailable; an export alone does not clear the pending draft.

Browser-only mode still uses browser storage. Its data and file permissions do not automatically travel with a USB; the folder layout above applies to the native Windows package.
