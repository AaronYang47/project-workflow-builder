# L5 factory scene

The playback uses `public/simulation-assets/factory-realistic.jpg`, generated with
Dreamina Seedream 5.0 Pro at 2560 × 1440. The image provides the factory shell,
roller bed, yard and road. Modules and trucks are rendered separately from the
simulation's current day, so the picture follows the schedule and project colours.
The factory controls allow 1×–2.5× zoom.

The image is an illustrative factory, not a survey of an actual facility.

- Canvas: https://jimeng.jianying.com/ai-tool/ai-canvas/91dd3020-9d16-450a-878a-93f39b8be044
- Node: `node_r84dy2xx3w`
- Resource: `5ca15936-5fa6-4930-8565-d2e54e38dd23`
- Generation: `73481541-d814-4378-a85a-f33cc3cd6648`

Background coordinates in `factory-scene.tsx` place moving modules on the roller
bed and yard modules in a capacity-dependent grid. Replacing this image requires
recalibrating those coordinates. The background is served locally so playback
and PDF capture do not depend on Dreamina at runtime.
