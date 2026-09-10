# Four selectable calves — preview only

Scope: replace the three standard playable models and secret fourth model, their selection portraits, and the large opening portrait. The three roadside cameo instances reuse these same model factories and therefore share the replacement appearances. Ordinary herd factories, enemies, levels, audio, app icons and store metadata are unchanged. This is not a completed rights-clearance or release build.

The new models are procedural Three.js geometry in `original-models.js`. Portraits are rendered directly from those same models, not separate character illustrations. The original character/save keys remain stable. The secret character still requires six memories.

The fourth character previously lacked a difficulty profile and threw during title-screen weather rendering when selected. It now uses the normal difficulty profile with the secret label; no other difficulty values changed.

Local preview tools (with Vite on port 5173):
- `node scripts/render-character-previews.mjs`: regenerate matching portraits and body previews.
- `/art/contact-sheet.html`: four-character comparison.
- `node scripts/test-character-preview.mjs`: desktop/mobile browser smoke test of selection, portrait loading, entering play, sprint/shove inputs and runtime errors.
- `npm run build`: web production compilation; does not deploy or submit.

Browser emulation is not an iPhone/Android native-device test. Old icons and other legacy content remain for a later, separately scoped pass.

## Second visual pass
User feedback: first pass was too ordinary/cute. Reworked the same four models into wonky, asymmetrical calves: wide or diagonal heads, mismatched staring/sleepy eyes, offset jaws, uneven teeth and bent horns. Stonebearer has a smaller head over oversized unequal shoulders. Portraits regenerated from the updated gameplay models. No new enemy, herd or level changes.

## Third visual pass — deadpan surrealism
User requested an entirely serious expression rather than comic distortion. Removed visible teeth, uneven eyes, diagonal jaws, bent horns and crooked bib. All four have a level, closed-mouth gaze and restrained colors. Their differences are now proportion-based: broad head, low wide forehead, a long straight neck, and a small head above a powerful symmetrical torso. Existing movement/gameplay is retained. Matching large portraits and opening image regenerated.

## Fourth visual pass — gentle yellow cattle
All four playable characters now use warm yellow/ochre coats. Faces and muzzles are rounder; eyelids are lighter, pupils larger, and the gaze is placid rather than cold. Closed mouths and intact symmetric features preserve the deadpan direction. The four silhouette differences are retained. Shove hands share the new skin palette. Portraits were regenerated from these models.

## Seventh pass — Super Bull, archived legacy visuals
The fourth name is Super Bull again in every language. Replaced stone armour with orange muscular anatomy (wide shoulders, thick arms, chest and legs), retaining the placid face. Playable, roadside-super and final-rescue-super instances now use the same factory. Old cape/logo implementation and stone-armour model are backed up under `art/archive-not-shipped`, with no runtime imports. Legacy public portraits moved into that archive. All web icon PNGs now render the new original Niuniu; legacy filenames retained for compatibility. No native package rebuild or store submission has been performed.
