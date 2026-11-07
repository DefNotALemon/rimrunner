# Your ship (Extraction) — src/homeship.js

The Extraction hub menu is gone. You live aboard your own ship, a Rimrunner-class courier built on the Space Ranger Workhorse layout (squircle crown liner, graphite rib every 0.76 m, rounded partitions, side airlock).

## Layout (bow → stern, 24 m)
- **Cockpit**: four contract screens on the console (look + interact = burn for that job), helm (in transit: long-range scan for new contracts, 50 cr; docked: undock + sell the haul), comms (debrief / call a medic while docked).
- **Cabin**: bunk (sleep = back to title; you also wake here after dying), galley, dinette.
- **Airlock bay**: starboard side hatch (welds onto the target's port-0 tube), security panel + log, suit rack.
- **Armory**: gun rack (swap primary between jobs), fabricator (dial through blueprints, print: supplies, guns, armor, tamper alarm, sentry turret).
- **Hold**: behind an owner-only vault door. Strongbox (24 slots) for haul you want safe.

## Contexts
- **Transit** (`mode 'home'`, `HomeSpace`): only your ship, stars through the canopy. Picking a contract burns ~6 s (streaks), then fades straight into…
- **Docked** (`mode 'extract'`): the same build welded onto the target's tube inside `ExtractShip` (`buildHome(..., {oz: mine.z, docked: true})`); the tube's end wall is skipped (`contract.homeDock`, shipbuild.js). You keep your spot aboard.
- Undock from the helm while aboard → back in transit where you stood. No results screen: the ship AI says the debrief, the comms screen shows it.

## Rules
- Haul in your pack is lost if you die out there. Haul in the hold survives death and is sold on your next undock.
- Timer runs out while you are aboard = emergency undock (counts as a success; job pays only if done).
- Reloading mid-job = lost link: chain reset, hold intact (the hold is saved on close, the pack is never saved during a job, so no dupes).

## Security
- The hatch opens for the owner only (and never in transit). NPC nav is built with the hatch always closed (`S.rebuildNav` wrapper), so no path into the ship exists.
- Any non-survivor NPC that ends up inside the ship's volume is pushed back out to the tube and logged.
- Rival runners may come for your haul when the hold has value: they walk to your hatch, work the lock for ~8 s, it holds, they give up (or fight if they see you). Logged; with the **tamper alarm** the ship AI warns you and the lights go red. The **sentry turret** (mounted in the tube) shoots them.
- The hold has no NPC code path at all; only your interact opens it.

## Debug / tests
- `__rr.homeship` (HomeRun): `.home` (HomeSpace), `.D` (docked build), `.course(i)`, `.dock(contract)`, `.holdValue()`.
- `?extract` boots aboard; `?extract&class=server_m&seed=1` docks straight onto a target.
- Node test: `ROOT=<tree>/ node ~/.hermes/cache/scratch/rr_home/test.mjs` (transit, dock, nav sealed, owner door, raider at the hatch, push-out, death keeps hold, undock sells hold, emergency undock, reload).

## Not done
- Landing: Extraction has no planet targets, so the stern ramp is sealed décor. The open world keeps its own parked ship.
- Crew access mode (survivors are rescued at the tube, before the hatch).
