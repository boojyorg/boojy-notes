// Test entry for the real Electron main process. It points userData at a
// throwaway directory *before* the app's own main module runs (the config,
// settings and note-index files all hang off userData), then hands over to the
// built app unchanged. Launched by the Playwright harness, never by users.
import { app } from "electron";

const userData = process.env.BOOJY_TEST_USERDATA;
if (!userData) throw new Error("BOOJY_TEST_USERDATA must point at a temp directory");
app.setPath("userData", userData);
// A first-run test lets the app make its default folder, which lives under
// Documents; pointed at a temp directory so no test touches the real one.
const documents = process.env.BOOJY_TEST_DOCUMENTS;
if (documents) app.setPath("documents", documents);

await import("../../dist-electron/main.js");
