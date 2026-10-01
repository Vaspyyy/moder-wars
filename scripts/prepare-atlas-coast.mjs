// Pack the repository's Natural Earth polygons, without properties or raw JSON.
// Shared national edges cancel, leaving coast/lake outlines for one world path.
import { readFileSync, writeFileSync } from 'node:fs';
import {gzipSync} from 'node:zlib';
const resolution=process.argv[2] || '110m';
if(!['110m','50m','10m'].includes(resolution))throw new Error('Unsupported atlas resolution');
const data = JSON.parse(readFileSync(new URL(`../assets/geodata/${resolution}/cultural/ne_${resolution}_admin_0_countries.json`, import.meta.url)));
const rings = [], edges = new Map();
for (const feature of data.features) {
 const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
 for (const polygon of polygons) for (let r = 0; r < polygon.length; r++) {
  const ring = polygon[r].map(([x,y]) => [x, Math.max(-85.051129, Math.min(85.051129,y))]);
  // Nonzero winding: exterior and holes have opposite orientations.
  const area = ring.reduce((sum,p,i) => {const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  if ((area > 0) !== (r === 0)) ring.reverse();
  rings.push(ring);
  for (let i=1;i<ring.length;i++) {
   const a=ring[i-1], b=ring[i]; if (Math.abs(a[0]-b[0])>180) continue;
   const ak=a.join(','), bk=b.join(','), key=ak<bk?`${ak}:${bk}`:`${bk}:${ak}`;
   const entry=edges.get(key); if (entry) entry.count++; else edges.set(key,{a,b,count:1});
  }
 }
}
const coast=[...edges.values()].filter(edge=>edge.count===1);
const size=16+rings.reduce((n,r)=>n+4+r.length*8,0)+coast.length*16;
const bytes=Buffer.alloc(size);let offset=0;
const uint=value=>{bytes.writeUInt32LE(value,offset);offset+=4;};
const float=value=>{bytes.writeFloatLE(value,offset);offset+=4;};
uint(0x534c5441);uint(1);uint(rings.length);uint(coast.length);
for (const ring of rings) {uint(ring.length);for (const [x,y] of ring){float(x);float(y);}}
for (const {a,b} of coast) for(const value of [...a,...b])float(value);
writeFileSync(new URL(`../assets/atlas/coast-${resolution}.bin.gz`,import.meta.url),gzipSync(bytes,{level:9}));
console.log(`Atlas coast: ${rings.length} rings, ${coast.length} shoreline segments, ${bytes.length} bytes`);
