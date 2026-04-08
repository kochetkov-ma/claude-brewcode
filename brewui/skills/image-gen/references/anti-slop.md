# Anti-Slop Strategy

## Step 1: Story-First (before writing any prompt)

1. **Lore** — WHY are these objects/people in this scene? What caused this moment?
2. **Physics** — What physical laws govern this scene (gravity, light, materials)?
3. **Time** — What will happen in the next second? Scene is frozen, not static.
4. **Era** — What period is this? Name 3 things that must NOT appear (anachronisms).
5. **Prompt** — Only now write the prompt. Every element must be grounded above.

> "a programmer at a desk" → 2003 startup, 2am crunch → single desk lamp, monitor glow, coffee steam → just looked up → CRT monitor, tangled cables, sticky notes → no hologram, no glowing blue.

---

## Step 2: Replace Generic with Specific

| Instead of... | Use... |
|---|---|
| `dramatic lighting` | `single 40W desk lamp, warm tungsten, long shadow left` |
| `futuristic computer` | `IBM ThinkPad T42, lid open, screen reflecting on face` |
| `beautiful woman` | `30-year-old baker, flour on apron, tired eyes after 5am shift` |
| `epic landscape` | `Tuscan hillside, July, dried grass, heat haze at horizon` |
| `cinematic scene` | `35mm film grain, slightly underexposed, natural color cast` |

---

## Step 3: Forbidden Patterns (never generate these)

**Technology:** holographic UI panels, glowing blue circuits/server racks, portless sleek laptops (show cables/ports/vents), quantum computer aesthetics, data centers with teal glow

**Lighting:** god rays as filler, rim-light halo on every subject, lens flares without real source, multiple contradictory light sources, bioluminescent glow on skin/water/organisms

**Color:** teal+orange grading, purple/pink gradient backgrounds, neon on dark without falloff, blue glow on any object, oversaturated palette

**Abstract/Cosmic:** Earth glowing blue from space, neural networks as glowing nodes, glowing DNA/atoms, nebula as background filler, floating particles, energy fields, magic dust

**Composition:** subject dead-center + symmetrical, dramatic low-angle hero shot, person silhouetted against gradient, hands holding glowing orb, "epic cinematic" everything

**Textures:** plastic poreless skin, metallic sheen on non-metals, every surface polished and perfect, repetitive algorithmic patterns

---

## Step 4: Forbidden Keywords (never include in prompt)

Quality inflators: `masterpiece` `best quality` `ultra-detailed` `8k` `4k` `UHD` `hyperrealistic` `award-winning` `trending on ArtStation`

Style homogenizers: `cinematic` `epic` `dramatic` `futuristic` `sci-fi` `cyberpunk` `neon` `holographic` `glowing` `bioluminescent` `ethereal` `mystical`

CGI triggers: `octane render` `unreal engine` `ray tracing` `CGI` `concept art` `matte painting` `volumetric lighting` `global illumination` `subsurface scattering`

---

## Step 5: Style-Specific Constraints (prepend to prompt)

### photo
```
CONSTRAINTS — Physically accurate photography:
- Single coherent light source, correct shadow direction and softness
- Exactly 5 fingers per hand, proper proportions, natural skin texture
- Fabric wrinkles follow gravity, metal reflects environment, glass refracts
- No glow halos, no plastic skin, no floating objects, no impossible geometry
- No repeating tile textures, no fractal noise surfaces
- Proper depth of field, chromatic aberration at edges, subtle lens distortion
```

### illustration
```
CONSTRAINTS — Professional illustration quality:
- Clean intentional line work: consistent stroke weight, no wobbly artifacts
- Harmonious palette, intentional contrast, no random saturation spikes
- Slight organic imperfections welcome, NO perfect symmetry
- Single vanishing point or intentional isometric, never mixed
- Preserve texture and grain appropriate to medium
- Functional elements: doors have handles, cups have bases, chairs have four legs
```

### art
```
CONSTRAINTS — Consistent artistic medium:
- Single coherent medium: oil OR watercolor OR digital, never mixed unintentionally
- Rule of thirds or golden ratio, clear focal point
- Preserve brushstroke texture, canvas grain, paper tooth
- One light source direction throughout
- Gravity works, reflections accurate, shadows consistent
- Unified color temperature, no random neon in a muted palette
```
