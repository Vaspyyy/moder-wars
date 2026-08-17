// Root-scoped entrypoint. Keeping the implementation in workers/ preserves the
// project layout while allowing the service worker to control the whole game.
importScripts("./workers/service-worker.js");
