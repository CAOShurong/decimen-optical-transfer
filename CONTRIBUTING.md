# Contributing to the camera-choice fork

Focused bug reports and pull requests are welcome here, especially fixes for
device, browser, and multi-camera behavior. For a camera bug, include the
browser, OS, device model, selected camera label, and capture resolution;
screen-to-camera behavior varies substantially across hardware.

Before opening a pull request:

1. Keep the change narrow and explain the user-visible failure it solves.
2. Run `npm test` and `npm run build:all`.
3. Add or update a test when the behavior can be exercised without physical
   camera hardware.
4. Do not weaken the protocol, file-integrity, or size-limit checks.

## Relationship to upstream

This repository is an MIT-licensed fork of
[`bashalarmistalt/decimen-optical-transfer`](https://github.com/bashalarmistalt/decimen-optical-transfer).
The upstream project currently asks contributors to file bug reports or make
forks instead of opening new pull requests. Please do not redirect a pull
request from this fork to upstream unless that policy changes.
