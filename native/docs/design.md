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
- **Divisions** have personnel, equipment (0 to 1) and morale (0 to 1, recovers out of combat). *Built in 4c (`sim/src/division.rs`, tuning numbers in one place).* Starting armies (built, `forces.rs`): 60% of each country's latest active personnel observation (World Bank / IISS, CC BY 4.0) up to the scenario start, as divisions of 10,000 spread along its land borders (over its cities when it has none); countries without an observation start with none. They are not yet placed by threat, so a big country's army is thin everywhere.
- **One combat model** (built, `combat.rs`): a division that moves into a cell held by enemy divisions attacks it. Each hour both sides lose morale and soldiers in proportion to the odds; defenders get a bonus, more in cities. A broken defender falls back one cell, away from the attack, or surrenders when it cannot. Rivers and terrain come later, with real data.
- **One movement system** (built, `movement.rs`, `path.rs`): routes over land cells (eight neighbours, no slipping through corners), costs in real metres, about 36 km a day; land the enemy still holds is half speed. Never water, never a country you are not at war with.
- **Control** (built, `control.rs`): a cell changes hands when an enemy division is within 20 km and no defender is. Undefended land falls ahead of an advance; contested land stays put, so fronts settle between armies. Seen in the viewer's sandbox war: attackers that slip between defenders instead of beating them end up cut off, because the land around the bypassed defenders stays theirs and blocks the attackers' supply line. Army groups (4d) avoid that by attacking side by side and cell by cell; single divisions sent past defenders still get cut off.
- **Supply** (built, `supply.rs`): once a day, divisions need a land path over their own country's land to its capital (or, once the capital falls, its biggest city left). Cut-off divisions lose equipment, morale and soldiers. Peace makes everyone supplied.
- **Army groups** (built, `army.rs`): a group's front is a line drawn near a border; it snaps to the group's own land along the border with one country, and the divisions spread evenly along it in the order they stand. Without an arrow the group holds: the front stays where drawn and only falls back where the enemy takes its land. With an arrow the group gathers on the stretch of front near the arrow (about 12 km of front per division) and every division at the front attacks the enemy cell beside it that lies most in the arrow's direction, side neighbours only, so the land behind stays linked for supply. An enemy division right beside an attacker is attacked rather than walked past. The attack sector's front is redrawn across the arrow each plan (its most forward border cell per 10 km strip); the arrow ends when its tip is taken. Groups move their divisions behind their own lines and re-plan every 3 hours and after every order. Divisions more than 300 km from their group's front march to its nearest point on routes from one search shared by all of them, so a whole army can cross a continent without stalling the game. A direct order to a division takes it out of its group. Orders can be applied while paused (`World::apply_orders`). With this, a division also holds the cell it stands on.
- **Economy and manpower** (built, `economy.rs`): each country's GDP is spread over the land it owns by law, half evenly over its cells and half over its cities by population. Whoever holds a cell gets its output, half of it for occupied land; income moves cell by cell as land changes hands. Once a day the budget puts a share of income into a recruiting fund and a share into an equipment fund (default 0% and 10%). A division costs one billion dollars and 10,000 men, appears at the supply source, at most two a day per country, and gets equipment only as far as the equipment fund pays; the same fund pays for repairing worn equipment. Mobilization levels 0 to 3 let 0.5%, 1.5%, 4% or 8% of the population serve and cost 0%, 5%, 15% or 30% of output. Soldiers lost do not come back to the pool. Money is whole thousands of dollars, so it adds up the same everywhere. What the budget leaves over goes to the home front, which keeps up war support.
- **War support** (built, `support.rs`): how much the people back the war, 0 to 100% (kept per mille), starting full. Each day at war it wears down by 0.4%, home front spending gives back up to 0.4% (all of it when the home front gets every dollar), every soldier lost costs support in proportion to everyone who could serve at total mobilization (losing half of them takes all of it), and own land in enemy hands costs up to 1% a day (by what that land produces). At peace it recovers by 1% a day. A country at war whose support reaches zero capitulates, so small countries break from losses that big ones shrug off. The AI takes peace below 40% and asks for it below 30%.
- **Regions:** a region is controlled by whoever holds most of its cells, and a region with a capital or a major city is an objective (for peace terms, 4f). The economy works per cell, so it needs no region data.
- **Peace terms** (built, `terms.rs`): when two countries make peace (or one capitulates), each region partly held by both goes whole to the side holding more of its cells, so pockets go back and the new border follows region lines. A region one of them owns by law and the other now holds more than half of becomes the holder's by law: it pays its new owner in full instead of the occupier's half and counts as its own land from then on. Divisions left on the other side's land go to the nearest land their country holds. Land held by anyone else is not part of that peace. Cities keep their original owner for capitals and supply. Without a region map, peace keeps every cell.
- **Diplomacy in v1:** declaring war, peace offers in both directions, and separate peace. Alliances wait for data on real 2026 alliances.
- **AI** (built, `ai.rs`): plays a country with the same commands a player has. Each AI country thinks once a day at its own hour. At war it switches to a war budget (25% recruiting, 15% equipment) and partial mobilization (general once it has lost a quarter of its land), keeps one army group per enemy it borders with a front along that border, puts new divisions into the group under most pressure, draws an arrow towards the enemy capital when the group is at least 1.5 times as strong as the enemy divisions within 150 km of its front, and takes it away below 0.9. It accepts peace when it has lost a fifth of its land, is weaker than 0.7 of the enemy or its war support is below 40%, refuses otherwise, and asks for peace once it has lost a quarter of its land or its war support is below 30%. Countries start passive; the front end hands them to the player and the AI. Soak test: four AI wars, 650 divisions, 60 days in about 4 s.
- **War and peace** (built, `diplomacy.rs`): a country at war offers peace to an enemy, who accepts or refuses; an unanswered offer runs out after 14 days. Each pair makes peace on its own, settled in whole regions (see peace terms). Once a day, a country at war that has lost its capital (its most populous capital city) and holds less than half of its own land, measured by what that land produces, capitulates: all its wars end and its divisions surrender. So does a country whose war support runs out.

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

## Front end (step 5)

The owner approved the mockups (pick a country, command the war, budget and mobilization, a peace offer) on 2026-11-16 and chose:

- **Army groups:** a list on the left, one row per group with its front, size and strength (not cards on the map).
- **Budget:** three sliders that always add up to 100% (recruiting, equipment, and the home front that is left).
- **Reports:** a feed on the right for everything; big events (a war declared on you, a peace offer, a capitulation) also pop up a card and pause the game.
- **Peace terms:** the regions that would change hands light up on the map behind the peace window, which also lists them by name.

Built in slices, each its own PR:

| Slice | What |
| --- | --- |
| 5a | Pick a country: the paused world with every real army, a country card, "Lead"; the top bar (country and wars, date, pause and speeds, income, people left to draft, divisions, war support). Built. |
| 5b | Command the war: the army group list, the command bar (draw front, draw arrow, hold), the map key, the reports feed with big-event cards. |
| 5c | The budget and mobilization window, opened from income and people left to draft in the top bar. |
| 5d | The peace window (the comparison table, the regions both ways, lit on the map) and declaring war from a country's card. |

The look comes from the mockups: dark blue-grey panels over the map, Barlow and Barlow Condensed (SIL Open Font License, `game/fonts/`), gold for what the player acts with, orange for attack arrows, red for war. Shared colors, fonts and boxes are in `game/ui/style.gd`.
