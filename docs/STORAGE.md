# Extraction storage: loot shelves + space containers

Code: `src/storage.js` (kinds, loot tables, geometry, rigs), placed by `src/shipbuild.js` (room furnishing), handled hands-on by `src/stash.js`.

## Shelves (loot in the open)
| kind | where | tiers |
|---|---|---|
| `wallshelf` | against a room wall (`SHELF_ROOMS`: 1-2 per room type) | 3 (0.5 / 1.0 / 1.5 m) |
| `shelfunit` | freestanding in roomy halls (`UNIT_ROOMS`: armoryhall, assembly, canteen, medbay, tankhall; room >= 7x6 m) | 4 (0.12 / 0.62 / 1.12 / 1.62 m) |

Frames are static boxes in the ship's Batch (no draw-call cost). Each room type gets its own look (`shelfLook`: frame, tier and lip colours) and never a sign. Loose items lie on the tiers (`stockShelf`, loot from `SHELF_LOOT` by room group: med, lab, maint, arms, crew, cargo); empty tier ends get clutter boxes (`shelfDecor`).

## Containers
**Enclosed**: search with Interact, its rig opens, then the contents lie inside:
- `canister`: cargo canister, the cap twists off
- `cryo`: cryo sample case, lid lifts, samples sit in a foam bed
- `evalocker`: EVA suit locker, the door pops its seal (helmet + suit inside)
- `ammocan`: military ammo can, lid hinges up, rounds sit on a packing insert
- `pod`: supply pod, petals fold open
- `medcab`: med cabinet with a glass door (you can see the contents, but you have to open it to grab)

**Open**: loot is visible from the start; no search:
- `pallet`: cargo pallet with corner rails
- `toolboard`: pegboard with a bench shelf
- `bin`: salvage bin full of scrap

Each kind has its own loot table (`KIND_LOOT`, with a chance to fall back to the ship family's `rollLoot`). Rooms choose kinds through `ROOM_CONT` in shipbuild.js.

## Interaction (stash.js)
- Shelves and open containers are `S.displays`. Their item meshes are only built within `SHOW_R` of the player (LOD every 0.25 s) and hidden past `HIDE_R`.
- Aim at an item within reach and click Fire to grab it into the shoulder bag (Shift+Fire takes one). Grabs are blocked through walls (`blocked()`). The hover tag shows the name, the description and the key hint. A full bag shakes the item and shows INVENTORY FULL. The backpack never opens for this.
- Enclosed kinds go through the normal `Stash.open` path (`c.rig`).

## Placement safety
Shelves and units are `prop`s in the deferred `pend` list: a 0.3 m flood fill must still connect every door, and a second pass drops the nearest clutter or shelf if any loot spot ends up walled in. The old storage-room rack props are now loot shelving units. The tests report 0 overlaps and 0 blocked doors.

## Debug: `window.__rr.storage` (installed by buildShip)
- `list()` returns `[{i, kind, open, x, z, room, items}]` for the displays.
- `stats()` counts per kind.
- `go(i)` stands the player in front of display i, facing it.
- `nearest(kind?)` returns the index of the nearest display.
- `kinds` lists `{enclosed, open, shelves}`.

## Tests (node, headless)
`~/.hermes/cache/scratch/rr_storage/test.mjs [gen|items|all] <seeds>` (set `ROOT=` to test a clean tree) covers counts, overlaps, door blocking, reachability, items resting within 4 mm on a surface, hover from the front, and grab/open for every kind. `reach.mjs` measures container reachability.
