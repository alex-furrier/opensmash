// Keep DOM initialization ordered, but give input and paint a turn between
// WebGL contexts. Static imports evaluated all of these in one long task.
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
// Bind selection before the grid publishes clickable fighters. On a cold
// reload an early characterselect event otherwise has no launcher listener.
await import('./game-launcher.js');
await yieldToBrowser();
await import('./grid-replica.js');
await yieldToBrowser();
await import('./logo-stage.js');
await yieldToBrowser();
await import('./crt-viewport.js');
await yieldToBrowser();
await import('./site-hardware.js');
