# Contributing

Focused bug fixes, tests, documentation, device reports, terminal improvements,
and well-scoped field-use features are welcome in this fork.

Decimen has an unusual compatibility constraint: old standalone senders and
receivers remain in circulation, and both ends independently derive every
fountain frame. A change that looks like an internal refactor can silently make
old artifacts undecodable. Read [the protocol notes](docs/technical/protocol.md)
before touching frame headers, `fountain.ts`, deterministic math, QR byte mode,
or the file container.

## Before opening a pull request

1. Search existing issues and upstream discussions so the history stays linked.
2. Keep the change focused on one observable problem.
3. Add or update a test that fails without the change.
4. Run:

   ```bash
   npm ci
   npm test
   npm run build:all
   ```

5. For CLI packaging changes, also run `npm run verify:cli-package`.
6. Exercise the affected browser, camera, terminal, standalone file, or release
   archive when the change cannot be proved by unit tests alone.

The CI suite pins the optical wire format with golden byte vectors. Do not
re-record those constants to make a failure disappear. If a wire-format change
is genuinely necessary, open an issue first and describe how older artifacts
will be detected, migrated, or rejected.

## Reports that are especially useful

- Camera and lens-selection failures with device, OS, browser, negotiated
  resolution/FPS, distance, lighting, and sender settings.
- Terminal QR failures with terminal name, font, dimensions, display scaling,
  frame bytes, ECC, FPS, and a photo of what the receiving camera sees.
- Cross-version interoperability results using a named release asset.
- Malformed-input cases that remain bounded and safe to share publicly.

## Security

Do not publish an unpatched exploit, hostile QR payload, terminal-control
injection, or sensitive device data in an issue. Follow [SECURITY.md](SECURITY.md)
and use the repository's private vulnerability-reporting form.

## Attribution and upstream work

This repository is a maintained MIT-licensed fork of Evan Crawley's original
Decimen Optical Transfer. Link upstream issues, commits, or prior implementations
when they influenced a change, and preserve authorship when carrying a patch.
