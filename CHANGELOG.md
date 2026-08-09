# Changelog

This fork follows the upstream wire format and records fork-specific releases here.

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
