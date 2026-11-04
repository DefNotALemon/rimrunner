# Missions and orbital stations (open world)

Starfield-style missions for Rimrunner's open-world mode, plus space stations you can fly to, dock with and walk around.

## What a player sees

1. **Stations in orbit.** Every system has 0–2 stations hanging around its worlds (the start system always has a civil port at the home planet and a derelict elsewhere). They show in space as a hub with a spinning ring, solar wings, a lit docking arm and a gold `⬡ name` label (derelicts: dark, torn ring, rust label).
2. **Docking.** Fly within ~900 m and the prompt reads "[interact] Dock at …" (button name follows the active input: E / X / Square / Y / USE). Press it, or just drift slowly into the dock arm and it auto-docks. A fade puts you on foot at the station's airlock.
3. **Aboard a civil port** (warm-lit, Rimway Port Authority livery, built with the Extraction generator and wall kit): a mission board kiosk by the hatch, a bar with a counter and a bartender, patrons, a dock hand, a port clerk, a back room with crew lockers you can search, and a couple of people with work (gold dot over their heads). Talking to them gets a pitch in their own voice and an Accept button.
4. **Derelicts** reuse Extraction's hostile classes (chem station, chip plant, server station): robots and ex-crew, sealed vaults, lootable containers, no run timer. Black-box missions send you here.
5. **The Missions screen** (journal button: J / Menu / Options / + / LOG): Active / Done tabs, the mission list (◆ = tracked), the giver and where they are, the brief, the objective checklist (done struck through, current bright with ▸, optional in italics with its bonus), what you're carrying for the job, the reward, and **Track**, **Set course** and **Drop mission**. A Journal button opens the old journal.
6. **Following a mission.** The tracked objective sits top-right with a hint when you need to do something first ("Jump to the X system", "Take off", "Undock at the hatch", "Land on X"). A diamond marker with distance points at the planet or station in space, at the marked spot on foot (with a light pillar), and at the person or item aboard a station (or the hatch, if the objective is elsewhere). Set course turns the ship toward the target in-system, or jumps when the target is in another system (25 fuel, out of the spaceway).
7. **Ticking.** Each objective completes with a toast plus a one-line "Next: …". Finishing pays the reward plus any optional bonuses.
8. Town **Exchange desks** carry the postings of the nearest civil port too ("Mission postings (Exchange desk)"). The old single-step quests (fetch / deliver / scout / gun) from townsfolk still work as before.

## Objective kinds (src/missions.js)

| kind | ticks when | event |
|---|---|---|
| `travel` | you're in system `sys` | `system {sys}` (polled in space / on foot) |
| `land` | touchdown on the named planet | `landed {loc}`: fired the first frame on foot on a planet (atmo landing, pad auto-land, tow, respawn) |
| `enter` | you step through the named station's hatch | `docked {loc}`: fired by the dock transition |
| `reach` | you're within `r` of a marked spot | `reach {loc, test}` polled on foot |
| `talk` | you talk to `who` at `loc` | `talk {loc, who}` from the dialogue |
| `take` | you pick up the mission item | `take {mid, oi}` from the item's interactable |
| `deliver` | talk to `who`, or reach `spot`, while carrying `item` | `talk` / `reach` |
| `return` | talk to the giver at their station | `talk` |

Locations: `p<sys>:<planet>` (surface) and `s<sys>:<k>` (station interior). Spots: `{ref:'exchange'|'patrol'|'cantina'}` resolve to that town building's door; `{ref:'wild', ang, dist}` is a polar offset from the planet origin. Only the current objective (first unfinished required one) and optional ones can tick; travel objectives tick at once if you're already there. Mission items are carried by the mission (`m.carry`), not the backpack, so a full pack never blocks a job.

## Templates (every one has at least one land-on-planet and one enter-station objective)

- **Ground Truth** (surveyor): land on a world, plant a beacon at the site, optional second anomaly (+80), dock back, report.
- **Station Pickup** (freight broker): (travel), dock at another port, talk to the quartermaster, collect the crate from the back room, land on a settled world, leave it at the Exchange.
- **Black Box** (insurance adjuster): (travel), board a derelict, recover the flight recorder (optional crew manifest +90), (travel back), land, hand it to the Patrol desk, dock back, collect.
- **Missing Person** (worried sibling): dock at another port, ask the bartender, land, find the stranded salvager at the marked site and talk to him, dock back, tell the sibling.
- **Passenger**: fly them down to a world (optional: walk them to the cantina +60), dock at another port, tell their sister the job's done.

Boards offer three missions per civil port, rotating every ~20 in-game minutes; accepted ids are remembered so a job never reappears. No kill counts, levels or danger stars.

## Files

- `src/stations.js` — pure: `stationsFor(sys)`, `stationById`, `stationContract(st)` (layout contract for `generateShip`).
- `src/ships.js` — `station_civ` class (family `station`, `calm`, minDepth 99 so it never shows on the Extraction board), `rimway` corp, station room table (canteen/crew/office/medbay/storage/control; the "vault" is the back crew room), loot rows. `shipbuild.js`: calm classes get no derelict wall damage.
- `src/station-interior.js` — `StationInterior extends ExtractShip`: builds the layout, then a bar counter (door-free wall, collider, bartender behind), the board kiosk, crew (people.js humans, idle/counter/console animation, turn to face you), mission people and items; derelicts run `populate()` + `populateCrew()` and the enemy loop without the run timer / director / hunger lock.
- `src/station-space.js` — station meshes, collision shell, dock detection, ship placement on undock. Rebuilt whenever `space.enter()` clears the scene, so `space.js` is untouched.
- `src/missions.js` — pure model: templates, `offersAt`, `accept/drop/track`, `event(type, data)`, `peopleAt`, `itemsAt`. State lives in `G.missions` (saved with the game; old saves load with none).
- `src/missions-ui.js` — glue + UI: `initMissions(app)`, per-frame `update(dt, mode)`, dock/undock, dialogue, board, Missions screen, HUD line, marker, planet-side beacons and people.
- `src/main.js` — small hunks: mode `'station'` runs through the on-foot branch with `MW.stn`, `st:*` interactables go to `MW.interact`, station containers go to Extraction's handler with `X.S` swapped, J opens the Missions screen.

## Debug hooks (`window.__rr.missions`)

- `give(tpl='survey', seed)` accept a mission posted at the start port; `open()` Missions screen; `board()` mission board.
- `dock('0:0')` dock at a station by id (`'<sys>:<k>'`); `land(i, sys)` touch down on a planet; `toStation()` park the ship 1.4 km from the first station in space.
- `next()` complete the tracked mission's current objective through the real path (land/dock) or the event API.
- `M` the mission model, `stn` the interior, `ssp` stations in space, `stations(sys)`.

## Tests

`node ~/.hermes/cache/scratch/rimrunner-missions/test.mjs [gen|tick|interior|glue]` (stubs document/localStorage):
generation over 50 seeds × 5 templates (land + enter present, every target exists), ticking every template through events and wrong places ignored, save/load and old saves, Nav from the airlock to every non-vault room and every interactable across all stations in 14 systems, and the real glue (fly to a station, press interact, dock ticks `enter`, talk to giver completes, undock, board a derelict, take the recorder).

## Next steps

- Backpack and weapon wheel don't open aboard stations yet (the pack/wheel code only checks `foot`/`jail`/`extract`).
- Town NPCs could pitch multi-step missions too (now they keep the old single-step quests; town Exchange desks carry the port's postings).
- Docking cinematics (approach lights guiding you in) and station traffic; landing pads inside larger stations.
- More templates (smuggling past a Patrol scan, station-to-station escort, rescue from a derelict cell block) and mission chains.
- Mission items as real backpack items with their own models.
