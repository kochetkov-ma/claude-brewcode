# Prompt Engineering Guide

Tips for getting the best results from each provider.

## Provider Strengths

| Provider | Best at | Weak at |
|----------|---------|---------|
| Gemini Imagen 3 | Photorealism, landscapes, objects, text in images | Complex multi-person scenes |
| FLUX 1.1 Pro | Complex prompt following, text rendering, detailed scenes | Speed (slower than others) |
| DALL-E 3 | Artistic styles, creative interpretation, consistent quality | Exact prompt following (rewrites internally) |

## General Tips

### Lighting
Specify light source explicitly. "Soft golden hour sunlight from the left" beats "nice lighting". Mention shadows direction if important.

### Camera Angle
Use photography terms: "shot from below at 30 degrees", "bird's eye view", "eye-level medium shot", "close-up macro". Avoid vague "good angle".

### Background
Describe background separately from subject. "Subject X against a blurred bokeh city skyline at dusk" gives better results than "X in a city".

### Composition
Mention layout: "centered", "rule of thirds with subject on left", "negative space on right side for text overlay".

### Color Palette
Name specific colors or reference palettes: "muted earth tones", "high contrast black and gold", "pastel pink and sage green". Avoid "colorful" or "pretty colors".

## Provider-Specific Tips

### Gemini Imagen 3

- Excels at photorealistic scenes -- lean into real-world descriptions
- Good with product photography prompts ("product shot on marble surface, soft studio lighting")
- Handles landscapes well -- specify time of day, weather, season
- Text in images works reasonably well ("sign that reads 'OPEN'")
- For multiple objects, describe spatial relationships explicitly

### FLUX 1.1 Pro (OpenRouter)

- Best prompt follower -- include every detail you want
- Excellent text rendering -- can put legible text in images
- Handles complex scenes with many elements
- Specify exact counts: "three red apples" not "some apples"
- Style keywords work well: "in the style of vintage poster art"
- Negative prompts not supported -- describe what you WANT, not what you don't want

### DALL-E 3 (OpenAI)

- Rewrites your prompt internally -- check `revised_prompt` in response
- Very good at artistic/painterly styles
- Strong with conceptual/abstract imagery
- "Digital art", "oil painting", "watercolor" style keywords are well-calibrated
- Tends to add drama and detail beyond what you specify -- be explicit if you want minimalism
- For precise control, add "I NEED this exact scene:" before your prompt to reduce rewriting

## Anti-Slop Integration

The anti-slop prefixes (from `anti-slop.md`) are prepended automatically based on STYLE choice. They:

1. **photo** -- enforces physics accuracy, prevents AI glow/smoothing
2. **illustration** -- enforces clean linework, prevents symmetry artifacts
3. **art** -- enforces medium consistency, prevents mixed-media confusion

The prefix goes BEFORE the user prompt in the API payload. The model sees constraints first, then the creative prompt. This ordering matters -- constraints seen first are weighted more heavily.

## OG Image Tips

For blog/social OG images specifically:

- Size: 1200x630 (social preview) or 1200x675 (Twitter)
- Leave space for text overlay if adding title later
- Use high contrast -- images are shown as thumbnails
- Avoid fine detail that disappears at small size
- Dark backgrounds with bright accents work well for tech blogs
- Specify "clean, minimal composition with space for text overlay on the left third"

## Prompt Length

| Provider | Max prompt | Recommendation |
|----------|-----------|----------------|
| Gemini | ~1000 chars | 200-400 chars optimal |
| FLUX | ~2000 chars | 300-600 chars optimal |
| DALL-E 3 | 4000 chars | 200-500 chars (it rewrites anyway) |

Anti-slop prefix adds ~400 chars. Keep user prompt under 600 chars to stay within all limits.
