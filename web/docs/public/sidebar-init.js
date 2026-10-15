// Sets html[data-sidebar] before first paint (CSP script-src 'self': external, blocking).
try{if(localStorage.getItem('sidebar')==='collapsed')document.documentElement.dataset.sidebar='collapsed'}catch(e){}
