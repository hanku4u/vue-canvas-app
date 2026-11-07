# Permissions

The goal is basic, understandable access control: who can see a canvas or a component, and who can change it. All of it is enforced in FastAPI.

## Identity

- The upstream gateway authenticates every request and sets **`x-knox-id`**. The app has no login, sessions or passwords.
- FastAPI middleware reads the header on every `/api` request:
  - Missing or empty → `401 UNAUTHENTICATED`. In local development, `DEV_KNOX_ID` is used instead.
  - Present → the user row is upserted (`first_seen`, `last_seen`) and the Knox ID is attached to the request.
- **Trust boundary:** the header is only trustworthy if FastAPI can't be reached except through the gateway. Deployment must ensure that, and `TRUSTED_PROXY_CIDRS` optionally adds a source-address check.
- **Display names:** `x-knox-id` gives only an ID. Display names come from a directory lookup if one is available (see open questions). Until then the Knox ID is shown.

## Roles

| Role | Scope | How it's granted |
| --- | --- | --- |
| **Admin** | Whole app | `admins` table, managed in the admin screen. `BOOTSTRAP_ADMINS` env var users are always admins, so nobody can lock everyone out |
| **Owner** | One canvas | Whoever created it. Admins can transfer ownership |
| **Editor** | One canvas | Share with role `editor` |
| **Viewer** | One canvas | Share with role `viewer` |
| *(none)* | — | No share. The canvas is invisible (404) |

In v1, canvases are private by default and shared with individual Knox IDs. Sharing with groups, or "anyone in the app", is a candidate extension (see open questions).

## Component restrictions

Each component can additionally be restricted:

| Flag | Effect |
| --- | --- |
| `view_restricted` | Only users on the component's access list (plus the owner and admins) can see it. Everyone else doesn't receive it at all |
| `edit_restricted` | Only users on the component's **edit** list (plus the owner and admins) can change it. Other canvas editors see it locked |

The access list (`component_acl`) holds Knox IDs with access `view` or `edit`. `edit` implies `view`.

**Key rule: restrictions only narrow canvas access, they never widen it.** Being on a component's list doesn't grant anything on a canvas you have no share for, and being on the edit list of a component on a canvas where you're only a viewer still leaves you a viewer.

### Effective access

```
isAdmin(u)            = u in admins or u in BOOTSTRAP_ADMINS
canvasRole(u, cv)     = 'owner' if u == cv.owner
                        else share role (viewer | editor) or none

canViewCanvas(u, cv)  = isAdmin(u) or canvasRole(u, cv) != none
canEditCanvas(u, cv)  = isAdmin(u) or canvasRole(u, cv) in {owner, editor}

canViewComp(u, c)     = isAdmin(u) or canvasRole(u, c.canvas) == owner
                        or ( canViewCanvas(u, c.canvas)
                             and ( not c.view_restricted or u in acl(c, view|edit) ) )

canEditComp(u, c)     = isAdmin(u) or canvasRole(u, c.canvas) == owner
                        or ( canvasRole(u, c.canvas) == editor
                             and canViewComp(u, c)
                             and ( not c.edit_restricted or u in acl(c, edit) ) )

canManageAccess(u,cv) = isAdmin(u) or canvasRole(u, cv) == owner      # shares + restrictions
```

### Who can do what

| Action | Admin | Owner | Editor | Viewer |
| --- | :-: | :-: | :-: | :-: |
| Open canvas, pan or zoom, change session filters | ✓ | ✓ | ✓ | ✓ |
| Interact with components (hover, sort, select, publish) | ✓ | ✓ | ✓ (visible ones) | ✓ (visible ones) |
| Duplicate canvas to own canvases (visible components only) | ✓ | ✓ | ✓ | ✓ |
| Add components and groups | ✓ | ✓ | ✓ | — |
| Move, resize, configure or delete a component | ✓ | ✓ | if `canEditComp` | — |
| Rename canvas, save default filters | ✓ | ✓ | ✓ | — |
| Move, rename or resize a group, save group filters | ✓ | ✓ | ✓ | — |
| Delete group (ungroup, keep contents) | ✓ | ✓ | ✓ | — |
| Delete group *and* contents | ✓ | ✓ | if `canEditComp` on **all** contents (including ones they can't see) | — |
| Share canvas, edit component restrictions | ✓ | ✓ | — | — |
| Delete canvas | ✓ | ✓ | — | — |
| Transfer ownership | ✓ | — | — | — |

### Edge cases

- **Groups and locked components:** moving a group moves all its children, locked ones included. This is acceptable because the group's layout belongs to canvas editors. A locked component's own position within the group can't be changed by people it's locked against.
- **Hidden children in groups:** when an editor ungroups or deletes a group, hidden children are detached to the canvas level with their absolute position kept. The editor never learns they existed. "Delete group and contents" is refused (`403 CONTAINS_UNEDITABLE`) if any child is hidden from or locked against the user.
- **Publishing from hidden components:** selection publishing happens in the browser of whoever is interacting, so a hidden component can't publish into another user's session.
- **Duplicating a canvas** copies only the components the duplicating user can view, drops all restrictions and shares, and makes the duplicator the owner.
- **Copy and paste** of a component behaves the same way: the pasted copy has no restrictions.
- **Owner leaves the company:** an admin transfers ownership (admin screen).
- **Restricting your last access:** the owner and admins always keep full access, so no restriction can lock them out.

## Enforcement

| Where | What |
| --- | --- |
| `GET /api/canvases/{id}` | 404 if `!canViewCanvas`. Components failing `canViewComp` are removed from the response. Each returned component carries `access.canEdit` |
| `GET /api/canvases` | Lists only canvases with a share, ownership, or (admin, with `scope=all`) everything |
| `POST /api/canvases/{id}/ops` | Every op is checked. One denied op fails the whole batch with `403` and the list of denied op indexes. Ops referencing a component the user can't view respond as if it doesn't exist (`404` for that op) |
| Shares and ACL endpoints | Require `canManageAccess` |
| `/api/admin/*` | Require `isAdmin` |
| `/api/query` | Requires an authenticated user. See below |

The frontend hides or disables UI based on `access` flags and the user's role, but that is a convenience only. The server is the authority.

### What restrictions do not do

Component restrictions control **visibility and editing of components on canvases**. They are **not data-level security**. Any authenticated user can build a component on any dataset and query it through `/api/query`. If certain data must be limited to certain people, that needs dataset-level permissions (DD-012 lists it as a possible extension) or enforcement inside the internal data API.

## Audit

The following are written to `audit_log` with the actor, target and before and after details:

- Share added, changed or removed
- Component restriction or ACL changed
- Canvas deleted or restored
- Ownership transferred
- Admin granted or revoked

Component content edits are not audited in v1, apart from `updated_by` and `updated_at` on each row.
