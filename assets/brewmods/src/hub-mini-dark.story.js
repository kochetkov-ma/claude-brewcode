// Storyboard of hub-mini-dark.gif: drawn scene (render.html &scene=1, no captures), dark card; twin hub-mini-light.story.js.
// palette role: [hex, cite]; record-gifs.mjs --check re-reads each cite (tokens.css <theme> <token> [over <token>] | render.html <selector>).
window.PH_STORY = {
  scene: 'hub-mini', theme: 'dark', twin: 'hub-mini-light',
  aria: 'A brewcode tap pours into a glass that slides in; the beer rises, a foam head forms, the glass is served',
  size: [640, 248], loop: 7, fps: 12, still: 5.5,
  palette: {
    bg: ['#161616', 'tokens.css brewcode --bg'],
    line: ['#939190', 'tokens.css brewcode --secondary over --bg'],
    counter: ['#272318', 'tokens.css brewcode --surface'],
    tapBody: ['#8C7039', 'tokens.css brewcode --scrollbar-thumb'],
    handle: ['#EBBB40', 'tokens.css brewcode --primary'],
    beer: ['#DF8D03', 'tokens.css brewcode --warning'],
    beerHi: ['#FAE96F', 'tokens.css brewcode --bright'],
    foam: ['#E3D6B6', 'render.html #ferm .f2'],
    foamHi: ['#FFF7E0', 'render.html #ferm .f3'],
  },
  // 1 px card edge (a palette role): the card reads on a white and on a dark page
  border: 'counter',
};
