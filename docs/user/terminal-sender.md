# Terminal sender

The `decimen` command turns a local file, piped bytes, or text into the same
fountain-coded QR stream as the browser sender. The existing web receiver reads
it; there is no phone app, account, pairing step, or sender-side browser.

This is useful when the sending machine only has a terminal, when installing a
GUI is undesirable, or when the receiving phone must not join the machine's
network. It is an offline optical transport, **not encryption**: another camera
with a view of the screen can recover the same payload.

## Install

Node.js 22 or later is required. The release archive contains one bundled
executable and no runtime dependencies:

```bash
npm install --global https://github.com/CAOShurong/decimen-optical-transfer/releases/download/v0.4.0-field.1/decimen-optical-transfer-0.4.0-field.1.tgz
decimen --version
```

To verify a downloaded archive first, download `SHA256SUMS.txt` from the same
[GitHub release](https://github.com/CAOShurong/decimen-optical-transfer/releases/tag/v0.4.0-field.1),
then run one of:

```bash
# Linux / macOS
sha256sum --check SHA256SUMS.txt --ignore-missing

# PowerShell
(Get-FileHash .\decimen-optical-transfer-0.4.0-field.1.tgz -Algorithm SHA256).Hash
```

From a source checkout, use `npm ci && npm run build:cli`, then run
`node dist-cli/decimen.js`.

## Send a file

Open <https://caoshurong.github.io/decimen-optical-transfer/receive/> on the
phone and allow camera access. On the sending terminal:

```bash
decimen send ./field-log.csv
```

Point the camera at the whole QR code. The receiver may start halfway through
the animation: fountain coding lets it recover from any sufficient set of
distinct frames. Keep the terminal still and press `Ctrl+C` after the receiver
has verified the file.

## Send stdin or text

`send -` treats stdin as binary. Supply a useful filename and media type when
the next device should know what the bytes are:

```bash
tar -czf - ./reports | decimen send - --name reports.tar.gz --type application/gzip
git bundle create - --all | decimen send - --name repository.bundle
```

`text` treats its arguments—or `-`—as UTF-8 text:

```bash
decimen text "temporary recovery instructions"
printf 'multiline\nmessage\n' | decimen text -
```

`trans` is a convenience command. One exact path to an existing regular file is
sent as a file; otherwise its arguments become text. Use `send` when a mistyped
path must fail instead of becoming a text snippet.

## Check the transfer before displaying it

Dry-run mode performs the real read, SHA-256, optional gzip, fountain setup,
and QR sizing without writing an animated code:

```bash
decimen send ./firmware.bin --dry-run
decimen send ./firmware.bin --dry-run --json
```

The plan distinguishes original bytes, compressed data, the full optical
container, source-block count, expected fountain overhead, terminal footprint,
and a perfect-capture estimate. Real cameras usually take longer because missed
or blurred frames are discarded.

## Fit, speed, and reliability

By default, the CLI chooses the largest camera-friendly frame up to 500 bytes
that fits the current terminal. A classic 80×24 terminal therefore gets a much
smaller QR code than a large local window. If no terminal dimensions are
available, such as a JSON dry run, the fallback is 160 bytes.

Useful controls:

```bash
decimen send file.bin --fps 6                 # slower animation for a struggling camera
decimen send file.bin --frame-bytes 220       # denser QR, faster when it scans reliably
decimen send file.bin --ecc M                 # more in-frame damage tolerance, less capacity
decimen send file.bin --margin 4              # ISO-recommended quiet zone (the default)
decimen send file.bin --plain-screen          # avoid the alternate screen buffer
decimen send file.bin --invert                # only for an unusual display/camera combination
```

Larger frames reduce the number of source blocks but create denser codes. Faster
is not automatically better: lower `--fps` or `--frame-bytes` if the receiver
rarely counts new frames. Enlarge the font or window if the QR appears physically
small on the sending display.

The optical container is limited to 64 MB. Its source-block count is a 16-bit
wire field, so a large payload may also require a larger `--frame-bytes`; the CLI
calculates and reports the minimum usable value before animation starts.

## Automation and captured output

An endless ANSI animation should not accidentally fill a log. Non-interactive
stdout is rejected unless both `--force` and a finite `--frames` count are given:

```bash
decimen text "diagnostic" --frames 1 --force > one-frame.ansi
```

`--session` fixes the normally random transfer session id for reproducible tests.
Do not reuse a fixed session for two different simultaneously visible streams.

## Remove

```bash
npm uninstall --global decimen-optical-transfer
```
