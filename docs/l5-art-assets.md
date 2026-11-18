# L5 factory scene

Playback opens on the indoor assembly hall. The roller path follows the foreground
bed in `public/simulation-assets/assembly-hall.jpg`. Module sprites are anchored
at the base, with perspective adjusted to the path. The close-up shows spaced
modules so their underframes remain visible. The inventory lists every module
on the selected day.

The Yard & shipping view uses `public/simulation-assets/factory-realistic.jpg`
for the yard and road. Both views use locally served Dreamina images.

- Canvas: https://jimeng.jianying.com/ai-tool/ai-canvas/91dd3020-9d16-450a-878a-93f39b8be044
- Assembly hall: `node_cbbatydcvy`, resource `47bfeb55-93e0-4d0f-bc43-68bc2c3aad68`
- Yard: `node_r84dy2xx3w`, resource `5ca15936-5fa6-4930-8565-d2e54e38dd23`

## Module and truck sprites

Three additional Seedream 5.0 Pro images were generated and cut out in Dreamina.
They are used in the panorama and in the module inventory beneath it.

| Local asset | Cutout node | Resource |
| --- | --- | --- |
| module-building.png | node_g7c3py3x22 | 6f866c9a-e647-483a-919e-4f517200b15e |
| module-finished.png | node_tsfa0qmt83 | b3a1bb58-9228-41d0-9965-08e8313cad1f |
| truck.png | node_gzc75w8mt9 | feace177-43bc-4f62-8e14-5c35a923ea1d |

Each production card represents one module from the selected simulation day,
with its project, module number and progress. Each yard card represents one
occupied space. Yard space numbers are display positions, since the simulation
tracks finished modules as counts per project. Factory total equals the line
count plus the yard count. The near-complete illustration appears from 85%
progress. These two illustrations indicate progress, not measured construction
milestones.
