#!/usr/bin/env node
// Thin shim that loads the compiled CLI from dist/.
// During development, use `npm run dev -- check ...` (which uses tsx).
import "../dist/cli.js";
