# Flags

Country and subdivision flags (`<code>.webp`, 320 px wide) come from
[flagcdn.com](https://flagcdn.com/), a service of [Flagpedia.net](https://flagpedia.net/about).
Flagpedia states that the flag images are in the public domain and free for
commercial and non-commercial use. The codes follow `assets/geodata/flagcodes.json`.

`legacy/` holds the custom flags that the built-in scenarios used to load from
WebSim's blob store (for example Transnistria, Abkhazia, East Germany). They are
kept under their original file names so old scenario files resolve to them.

Rebuild both with `node scripts/build-flags.mjs`, which also regenerates
`src/flag-manifest.js`. At runtime, `src/flags.js` maps flagcdn.com and WebSim
blob links in scenario and country files to these files; other links are left
unchanged.
