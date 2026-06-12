// Single source of truth for the app version — read straight from package.json
// so a `chore(release)` version bump is the only place it ever changes.
import pkg from "../package.json";

export const VERSION: string = pkg.version;
