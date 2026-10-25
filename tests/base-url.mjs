// Where the tests serve the app. Set CL_BASE=/cyber-logbook/ to test it from a sub-folder,
// exactly like GitHub Pages serves it (https://<you>.github.io/cyber-logbook/).
export const BASE_PATH = process.env.CL_BASE || '/';
export const PORT = Number(process.env.CL_PORT || (BASE_PATH === '/' ? 4173 : 4174));
export const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;
