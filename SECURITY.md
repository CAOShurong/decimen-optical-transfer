# Security policy

## Supported version

Only the latest release of this fork receives security fixes. Older standalone HTML files keep running indefinitely, so replace saved copies when a new security release is published.

| Version | Supported |
| ------- | --------- |
| 0.4.0-field.1 | Yes |
| 0.3.2-camera.1 and older | No |

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting form in the repository Security tab. Do not open a public issue with an unpatched exploit, a hostile QR payload, or sensitive device data.

Include the affected surface, the smallest safe reproduction, expected impact, and whether the issue also affects the upstream project. Please avoid destructive proof-of-concept settings when a bounded demonstration establishes the same behavior.

## Trust boundary

Every QR frame, file name, media type, compressed payload, and claimed length is attacker-controlled. The receiver must validate those values before allocating memory, decompressing data, rendering metadata, or offering a download. SHA-256 verifies recovered file integrity; it does not authenticate the sender. The optical channel is not encrypted, and any camera with a view of the screen can read it.

The terminal sender also treats local paths and piped bytes as untrusted. It
bounds input before buffering it, sanitises transmitted names before displaying
them, restores terminal state after signals, and refuses unbounded output to a
non-interactive stream unless the caller explicitly supplies a finite frame count.
