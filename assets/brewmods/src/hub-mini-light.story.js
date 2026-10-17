// Storyboard of hub-mini-light.gif: drawn scene (render.html &scene=1, no captures), white card; twin hub-mini-dark.story.js.
// palette role: [hex, cite]; record-gifs.mjs --check re-reads each cite (tokens.css <theme> <token> [over <token>] | render.html <selector>).
window.PH_STORY = {
  scene: 'hub-mini', theme: 'light', twin: 'hub-mini-dark',
  aria: 'A brewcode tap pours into a glass that slides in; the beer rises, a foam head forms, the glass is served',
  size: [640, 248], loop: 7, fps: 12, still: 5.5,
  palette: {
    bg: ['#FFFFFF', 'tokens.css brewcode-light --card'],
    line: ['#818181', 'tokens.css brewcode-light --field-border over --card'],
    counter: ['#E8E5DF', 'tokens.css brewcode-light --surface'],
    tapBody: ['#8B7020', 'tokens.css brewcode-light --bright'],
    handle: ['#C9A030', 'tokens.css brewcode-light --primary'],
    beer: ['#C9A030', 'tokens.css brewcode-light --primary'],
    beerHi: ['#DCB237', 'tokens.css brewcode-light --primary-hover'],
    foam: ['#E8E5DF', 'tokens.css brewcode-light --surface'],
    foamHi: ['#FFFFFF', 'tokens.css brewcode-light --card'],
  },
  // 1 px card edge (a palette role): the card reads on a white and on a dark page
  border: 'counter',
};
