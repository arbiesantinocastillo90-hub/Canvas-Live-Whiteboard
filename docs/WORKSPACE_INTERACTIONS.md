# Workspace interactions and creation destinations

This revision brings layer organization, selection, panel sizing, and project actions into the same workspace controls.

## Choose where new work belongs

Creating a project requires an explicit **Parent project** choice before **Create project** is enabled. Choose an existing project to create a subproject, or choose **Workspace root** to create a top-level project. Workspace root is also the destination for the first project in an empty workspace. A suggested parent from **New subproject** still needs confirmation in the selector.

Home's **New canvas** first asks for a **Destination project** from the current workspace. Choosing **Continue** opens the canvas naming dialog in that project; the destination is already confirmed, so it is not requested twice. Creating a canvas directly from Work asks you to confirm its current project in the naming dialog. Use Home to choose a different project.

An empty workspace needs a project before a new canvas can be created. Canceling either dialog creates nothing. Renaming keeps its existing parent choice without requiring a new confirmation. Imports retain their existing import behavior.

These destinations are projects inside Canvas Live. Choosing one does not open a computer-folder picker or change the physical save destination. Use **Save options** for physical canvas file locations.

## Project actions

Right-click a project card or a project row in Home's hierarchy to open its menu. Keyboard users can focus the project button and press **Shift+F10** or the context-menu key. Use Up/Down to move between available actions, Enter to select, or Escape to close.

The menu offers:

- **Open file location** when a local location is available. Current projects do not have a linked folder, and browser-imported project archives do not expose their source path. This item is disabled with an explanation; it does not open an unrelated library file or invent a folder path.
- **Open project** to browse its contents.
- **New subproject** to open creation with that project as the suggested parent.
- **Rename project** to change its name or parent.
- **Customize project** to adjust its card appearance in the current workspace.

Only projects owned by the active workspace appear as creation destinations. Switching workspace closes pending project menus and creation prompts.

## Layers and their objects

**Properties & layers** contains one expandable layer list. Layers are listed **front to back**: a layer near the top draws in front of a layer below it. Expand a layer to see and select its objects.

Drag a layer by its grip and drop above or below another layer to reorder it. A drop indicator marks the destination. The former forward/backward arrow buttons are replaced by dragging; keyboard users can focus the grip and use **Alt+Up** or **Alt+Down**.

Drag an object row into another visible, unlocked layer to move it there. Locked or hidden source objects cannot be moved this way, and locked or hidden layers cannot receive them. The object layer selector remains available in properties. Undo reverses the move or reorder.

Expansion and reordering use the interface's motion settings and respect reduced motion.

## Areas and multiple selections

Click an area's border to select it. Its interior leaves the objects and canvas beneath it available for interaction. A box selection includes an area when the selection crosses one of its borders; a box entirely inside the area does not select the area just because it overlaps its interior.

Within a layer, areas draw behind the other objects. The separate **Containing area** property is removed from the panel; use layers to organize new work. Existing saved area relationships remain compatible.

Selecting several objects makes both the right properties panel and the quick properties panel address the selection. Applicable color, fill, text formatting, connection formatting, and layer changes apply to the editable selected objects. A text setting affects text-bearing objects; a connection setting affects connections. Locked or hidden objects retain their properties. The displayed values come from a representative selected object rather than combining different values into a new value.

## Panel edges and canvas chrome

Left and right panels can be resized from their top and bottom edges as well as their sides. Drag an edge to adjust it, use its focused separator with arrow keys for keyboard adjustment, or double-click to restore the default inset. Top and bottom positions are remembered with that workspace's layout and bounded so the panel remains usable.

Canvas tabs retain a visible bottom divider, and action buttons have visible boundaries against the canvas. Pressing Escape or returning focus to the canvas does not add a large outline around the canvas surface. Keyboard focus remains available on the interactive controls.

## AI context

Workspace AI shows project, canvas, and connected-client context only while that canvas is shared. A reported client name such as ChatGPT, Claude, or Codex identifies the application reported by the connection; it does not prove which model is running. Portable startup and external-client setup are described in [Portable MCP](PORTABLE_MCP.md).

## Related guides

- [Rich canvas controls](RICH_CANVAS.md)
- [Workspace contents and independent appearance](WORKSPACE_ISOLATION.md)
- [Save destinations and autosave](SAVE_OPTIONS.md)
- [Adaptable workspace](ADAPTABLE_WORKSPACE.md)
