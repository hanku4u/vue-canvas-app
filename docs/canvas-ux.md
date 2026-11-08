# Canvas UX

How the app looks and behaves for engineers. Component internals are in [components.md](components.md). Permission rules are in [permissions.md](permissions.md).

## Screens

### Home

```
┌──────────────────────────────────────────────────────────────────────┐
│ vue-canvas-app                                   [Admin]  j.doe ▾   │
├──────────────────────────────────────────────────────────────────────┤
│ [ + New canvas ]   Search canvases… [            ]                   │
│                                                                      │
│ My canvases                         Shared with me                   │
│ ┌──────────────┐ ┌──────────────┐   ┌──────────────┐                 │
│ │ ET-04 CD     │ │ Lot A123     │   │ Litho weekly │                 │
│ │ excursion    │ │ yield review │   │ by k.lee     │                 │
│ │ edited 2h ago│ │ edited 3d ago│   │ viewer       │                 │
│ └──────────────┘ └──────────────┘   └──────────────┘                 │
└──────────────────────────────────────────────────────────────────────┘
```

- Cards show title, owner (for shared canvases), your role, and last edited time.
- Card menu: open, duplicate, rename (editor), share (owner), delete (owner).
- The **Admin** link appears only for admins.

### Canvas editor

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← ET-04 CD excursion ✎        Saved ✓        [Share]  [⋯]     j.doe ▾   │
├──────────────────────────────────────────────────────────────────────────┤
│ Filters: [Time: last 7d ▾] [Tool: ET-04 ×] [Lot: + ] [+ filter]  Reset   │
├─────────┬────────────────────────────────────────────────────┬───────────┤
│ Palette │                                                    │ Inspector │
│         │   ┌ Group: Chamber A ─ [Lot: A123 ×] ───────────┐  │           │
│ ▤ Chart │   │ ┌─────────────┐ ┌────────────┐              │  │ (config   │
│ ◉ Wafer │   │ │ SPC CD_MEAN │ │ Lot table  │              │  │  of the   │
│ ▦ Table │   │ │  ~~~/\~~~   │ │ ▦▦▦▦▦▦▦▦   │              │  │  selected │
│ ✎ Note  │   │ └─────────────┘ └────────────┘              │  │  item)    │
│         │   └─────────────────────────────────────────────┘  │           │
│         │                                       ┌────────┐   │           │
│         │                                       │minimap │   │           │
│         │                    [− 100% + ⤢]       └────────┘   │           │
└─────────┴────────────────────────────────────────────────────┴───────────┘
```

- **Top bar:** back to Home, title (inline rename for editors), save status, Share (owner and admins), overflow menu (duplicate canvas, export, canvas settings).
- **Filter bar:** canvas-level filters (see [Filters](#filters)).
- **Palette** (left, collapsible): component types from the registry. Hidden for viewers.
- **Canvas** (center): infinite surface with a dot-grid background, minimap and zoom controls.
- **Inspector** (right, collapsible): settings for the selected component or group. Read-only for viewers and for locked components.

### Admin

See [admin.md](admin.md).

## Canvas interactions

### Navigation

| Action | Input |
| --- | --- |
| Pan | Drag on empty canvas · Space + drag · middle-mouse drag · trackpad two-finger scroll |
| Zoom | Ctrl/⌘ + wheel · trackpad pinch · `+` / `-` · zoom controls |
| Zoom to fit all | `Shift + 1` |
| Zoom to selection | `Shift + 2` |
| Reset zoom to 100% | `Ctrl/⌘ + 0` |
| Jump via minimap | Click or drag on the minimap |

Zoom range is 10%–200%. Below about 50%, components switch to their lightweight preview.

Dragging a component you can't move (viewer, or the component is locked) pans the canvas instead. The viewport (position and zoom) is remembered per canvas in this browser.

### Wheel and drag inside components

Charts and tables also use the wheel and drag (zooming a chart, scrolling a table). The rule:

- A component is **inactive** until clicked. While inactive, wheel and drag over it act on the canvas, so panning never gets stuck on a chart.
- **Click** a component to make it **active** (highlighted border). While active, wheel and drag inside its body go to the component, and dragging its header still moves it.
- **Esc** or clicking empty canvas deactivates it.

This uses Vue Flow's `nowheel` and `nodrag` classes, applied only to the active component's body.

### Adding components

- Drag a type from the palette onto the canvas, or click it to place it at the center of the viewport.
- New components open with the inspector focused on their main setting (dataset for data components, text for notes).
- When dropped inside a group, the component joins that group.

### Selecting, moving, resizing

| Action | Input |
| --- | --- |
| Select | Click a component's header or border |
| Add to or remove from selection | Shift + click |
| Box select | Shift + drag on empty canvas |
| Select all | Ctrl/⌘ + A |
| Move | Drag the header. Arrow keys nudge 1 grid step (Shift: 10 steps) |
| Resize | Drag edges or corners. Respects the type's minimum size |
| Snap | 16 px grid. Hold Alt while dragging to disable |
| Bring to front / send to back | `]` / `[` |

### Editing

| Action | Shortcut |
| --- | --- |
| Undo / Redo | Ctrl/⌘ + Z / Ctrl/⌘ + Shift + Z |
| Copy / Paste | Ctrl/⌘ + C / V (pastes at the cursor; works across canvases in the same browser) |
| Duplicate | Ctrl/⌘ + D |
| Delete | Delete / Backspace |
| Group selection | Ctrl/⌘ + G |
| Ungroup | Ctrl/⌘ + Shift + G |
| Rename | F2 (selected component or group) |
| Refresh data | R (selected), Shift + R (whole canvas) |

Undo and redo cover only your own edits in this session. Undo of an edit that someone else has since changed shows a conflict instead of overwriting their change.

### Groups

- **Create:** select components, then Ctrl/⌘ + G or "Group" in the context menu. The group frame wraps the selection with padding.
- **Header:** title (double-click to rename), content count, filter chips for group filters (F10), collapse toggle, menu (rename, collapse, ungroup, delete group and contents).
- **Delete key** on a selected group removes the frame and keeps its contents in place. Deleting the contents too is an explicit menu action.
- **Move:** dragging the header moves the group and everything in it.
- **Membership:** drag a component into or out of a group frame to add or remove it.
- **Collapse:** the group shrinks to its header bar. Children are unmounted, so they cost nothing. Collapsed state is saved.
- **Nesting:** not supported in v1. One level of groups keeps filter scopes easy to understand.

### Context menu

Right-click a component, a group or empty canvas for context actions (the same as the shortcuts above, plus "Restrict access…" for owners and admins).

### Help

Press `?` (or the keyboard button by the zoom controls) for a cheat sheet built from the registered shortcuts, plus the mouse gestures. An empty canvas shows a few first-run tips until they're dismissed (remembered per browser).

## Filters

The filter bar and group headers show filter chips. Full resolution rules are in [data-layer.md](data-layer.md#filters).

- **Add filter:** `+ filter` lists the filter dimensions defined by the admin (Lot, Wafer, Tool, Chamber, Step, Product, Parameter, Time range, ...).
- **Value pickers:**
  - String dimensions: searchable multi-select fed by `/api/filters/{dimension}/values`. Pasting a newline or comma separated list of lot IDs is supported.
  - Time range: presets (last 24 h, 7 d, 30 d) or an absolute range. Relative presets stay relative when saved.
  - Number range: min and max inputs.
- **Group filters:** set from the group header menu. A group filter overrides the canvas filter for the same dimension inside that group. The chip shows an "overrides canvas" hint.
- **Published filters:** chips set by a component selection (e.g. lot rows selected in a table) show the source component's name, and clicking the chip highlights that component.
- **Session vs saved:**
  - Anyone (viewers included) can change filters. Changes are session-only and reflected in the URL (`?f.lot_id=A123,A124&f.time_range=last_7d`), so a specific view can be sent as a link.
  - Editors see **Save as default**, which stores the current filters as the canvas or group defaults.
  - **Reset** returns to the saved defaults.

## Save status and conflicts

| Indicator | Meaning |
| --- | --- |
| `Saving…` | Ops queued or in flight |
| `Saved ✓` | Everything acknowledged by the server |
| `Offline – retrying` | Network error. Edits are kept locally and retried with backoff |
| `Conflict` | Someone changed the same component. Click to resolve |

Conflict dialog: lists the conflicting components (who changed them and when) and lets you **keep theirs** (discard your change) or **reapply mine** (send your change on top of their version). The choice applies to all listed components. Since conflicts are per component, unrelated edits by two people never conflict.

Other people's changes appear when you reload or come back to the tab (refetch on focus). Live updates are out of scope for v1.

## Read-only and restricted states

| State | What the user sees |
| --- | --- |
| **Viewer** on a canvas | No palette. Can't move or resize. Inspector read-only. Can pan, zoom, change session filters, activate components (hover, sort tables, zoom charts, select rows to publish filters). A "View only" badge appears in the top bar, plus "Duplicate to my canvases" |
| **Locked component** (edit-restricted, user is an editor but not on the component's edit list) | Lock icon in the header. Can't move, resize, configure or delete. Interacts like a viewer |
| **Hidden component** (view-restricted, user not allowed) | Not sent to the client at all. No placeholder |
| **Restricted marker** (owner and admins) | Eye or lock icon on components that have restrictions. Hover lists who has access |

## Component chrome

Every component has the same frame:

```
┌─ ▤ SPC – CD_MEAN, ET-04      ⟳ 2m · 🔒 · ⋯ ─┐   header: type icon, title, data age, refresh,
│                                             │           lock/eye markers, menu
│            (component body)                 │
│                                             │
└─ lot_id ← group · time_range ← canvas ──────┘   footer (on hover): active filter bindings
```

Header menu: refresh, duplicate, copy, bring to front or send to back, restrict access (owner and admins), delete. Data components also get "View query details" (dataset, effective params, row counts, cache hit, timing).

## Empty, loading and error states

- **New canvas:** centered hint, "Drag a component from the palette to start", with the four types as large buttons.
- **Data component without a dataset:** inline dataset picker in the body.
- **Loading:** skeleton matching the component type. Previous data stays visible (dimmed) while refetching.
- **Empty result:** "No data for current filters", listing the effective filters.
- **Error:** short message with error code, a Retry button, and the request ID (copyable) for reporting.
