# Changelog

This fork follows the upstream wire format and records fork-specific releases here.

## [0.4.0-field.1] - 2026-08-09

### Added

- Installable `decimen` terminal sender for files, binary stdin, UTF-8 text, and SSH/browserless machines.
- ANSI half-block QR renderer, automatic terminal fitting, finite-frame capture mode, explicit FPS/ECC/frame-size controls, and JSON dry-run plans.
- Direct reuse of the browser container and fountain wire format, including gzip, SHA-256, 64 MB bounds, fixed QR mask/version, and receiver-compatible frames.
- Cross-platform package lifecycle verification on Ubuntu, Windows, and macOS, including a fresh install and a real rendered frame.
- Terminal sender guide, bundled dependency notices, and CLI release archive with checksums.

### Security

- Strip control characters and path components from filenames before they can reach terminal status output.
- Bound stdin before concatenation and prevent endless QR output when stdout is not interactive.

## [0.3.2-camera.1] - 2026-08-09

### Security

- Reject frames unless the declared total length is consistent with the source-block count and block length.
- Cap declared frame payloads at the product's 64 MB file limit before constructing a decoder.
- Add boundary tests for the one-frame memory-exhaustion report and legitimate short/full final blocks.

This fix preserves the authorship of
[`numospay`'s upstream pull request #27](https://github.com/bashalarmistalt/decimen-optical-transfer/pull/27),
which addresses
[`bashalarmistalt/decimen-optical-transfer#1`](https://github.com/bashalarmistalt/decimen-optical-transfer/issues/1).

## [0.3.1-camera.1] - 2026-08-08

### Added

- Explicit camera/lens selection after camera permission is granted.
- Camera restart without discarding already decoded fountain frames.
- Device-test issue template and automated camera-selection coverage.

[0.3.2-camera.1]: https://github.com/CAOShurong/decimen-optical-transfer/releases/tag/v0.3.2-camera.1
[0.3.1-camera.1]: https://github.com/CAOShurong/decimen-optical-transfer/releases/tag/v0.3.1-camera.1
[0.4.0-field.1]: https://github.com/CAOShurong/decimen-optical-transfer/releases/tag/v0.4.0-field.1
