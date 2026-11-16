# Design

**Status:** the direction and the five decisions below were agreed with the owner on 2026-11-16. Everything under "Proposals" is a starting point that tests and playtesting will change.

## The pitch

You lead one country, any country on the real 2026 map, through war, in real time with pause. You command army groups by drawing fronts and attack arrows, you pay for the war from a real economy, and you deal with allies and enemies. Every other country is run by an AI that uses exactly the same commands you do. Put the AI on every country and you get the old AI-vs-AI spectacle for free.

The browser game was a fish tank: nice to watch, little to do. The native game is about decisions.

## Decided

1. **Real time with pause.** No turns, ever. Several speeds; pause any time.
2. **Army groups with fronts and arrows,** plus optional control of single divisions. The player gives intent; divisions carry it out.
3. **Two map layers.** The 0.1° cell grid (3600 x 1800) carries military control and smooth moving frontlines. Real first-order regions (4,596 Natural Earth admin-1 states, provinces and oblasts in `assets/geodata/admin1/`) carry economy, objectives and peace terms.
4. **Any country is playable.**
5. **First playable:** one scenario (Modern World 2026), one player country, army orders, answering peace offers, a simple budget.

Earlier decisions that still hold: the UX is designed from scratch; the map stays clean; the browser game is frozen; saving is built into the simulation from day one.

## Core idea: controllers send commands

- The simulation state is plain data. Each country has a **controller**: the player, the AI, or none (passive).
- Controllers change the world only through **commands**, for example `DeclareWar`, `OfferPeace`, `AnswerPeace`, `CreateArmyGroup`, `AssignDivisions`, `SetFront`, `DrawOffensive`, `SetPosture`, `MoveDivision`, `SetBudget`, `SetMobilization`.
- A command is stamped with the tick it applies on. The simulation applies all commands at the start of that tick, in a fixed order.
- **Replays:** seed + scenario + command log gives the same game again. **Saves:** a snapshot of the state, plus the log since the snapshot if needed.
- **The AI** is a function from "what my country can see" to commands. It runs on a work budget and countries take turns across ticks, so 200 AI countries never stall a frame.

Tests that come with this, before any game rule:

- Same seed and same commands give a bit-identical state (compared by hash).
- Save, load and continue gives the same state as never stopping.
- An AI-vs-AI soak run stays inside a time budget per simulated day.

## First playable: the loop

1. **Pick a country** by clicking it on the map. The game starts paused.
2. **Go to war.** Declare war on a neighbour (AI countries declaring wars on their own comes later).
3. **Command.** Your divisions start in army groups along your borders. Drag a front onto a border sector, draw attack arrows into enemy land, set each group to hold or push. Divisions spread along the front by themselves. Select single divisions when you want precise control.
4. **Pay for it.** Income comes from your regions' economic output. Split the budget between recruiting, equipment and the home front. A mobilization level trades economy for soldiers.
5. **End it.** The AI offers peace when it is losing, and you accept or refuse. You can offer peace too. Terms are counted in regions: you keep the regions you hold.
6. **Lose it.** You capitulate when you lose your capital and most of your core regions, or when war support collapses.

## Proposals (simple first, changed by tests)

- **Time:** one tick is one game hour. Speeds run from about 6 game hours per real second up to "as fast as the CPU allows". The exact numbers belong to the clock module and its tests.
- **Divisions** have personnel, equipment (0 to 1) and morale (0 to 1, recovers out of combat). Starting personnel comes from the World Bank data the browser game already used.
- **One combat model:** divisions in contact on a front fight; attacker versus defender, with river and city defense bonuses. Terrain comes later, with real terrain data.
- **One movement system:** paths over land cells; supply is cut when a division has no land path to its own territory.
- **Control:** a cell changes hands when the enemy holds it with no defender nearby. One rule, written as a test first.
- **Regions:** each region's output is its country's GDP times its share of population (or of land cells where population is missing). A region is controlled by whoever holds most of its cells, and a region with a capital or a major city is an objective.
- **Diplomacy in v1:** declaring war, peace offers in both directions, and separate peace. Alliances wait for data on real 2026 alliances.

## Not in the first playable

Naval invasions, air war, missiles, research, politics and events, production lines, alliances, fog of war, peace-time content, the map editor, other scenarios. Each comes back only after the first playable is fun, one at a time.

## Make it its own game

The genre (real-time-with-pause grand strategy) is the inspiration, not any one game. We design our own systems, screens and words, and we do not copy another game's specific mechanics or interface. The modern setting gives the game its own identity: drones, missiles, sanctions, energy, and public support for the war are the layers that should make it different once the core works.

## Build order

| Step | What | Done when |
| --- | --- | --- |
| 4a | Simulation foundation: state, fixed-tick clock, seeded random numbers, commands, save/load | determinism and save/load tests pass |
| 4b | Regions: load admin-1, map every cell to a region, region stats | golden checks (e.g. Kyiv is in Kyiv city, Lviv in Lviv Oblast) pass |
| 4c | Divisions: movement, combat, control | behavior tests pass (3:1 attacks win, cut-off divisions lose supply) |
| 4d | Army groups: fronts and arrows become division orders | a drawn front gets covered, an arrow advances |
| 4e | Economy and manpower | budget and mobilization change recruitment as tested |
| 4f | War and peace | declare, offer, accept, refuse, capitulate |
| 4g | AI controller with the same commands | AI-vs-AI soak test inside its time budget |
| 5 | Front end, designed from scratch | owner approves mockups before big screens are built |
| 6 | Sound, polish, more content | |
| 7 | Packaged builds for Linux and Windows | |
