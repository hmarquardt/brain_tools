import { init } from "./ui.js";

init().catch((error) => {
  document.querySelector("#app").innerHTML = `<main class="fatal"><h1>Brain Tools failed to start</h1><pre>${error.message}</pre></main>`;
});
