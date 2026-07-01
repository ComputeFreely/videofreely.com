# FFmpeg Runtime

This site vendors the small browser wrapper needed to start FFmpeg conversion. The larger core runtime files are served from Cloudflare R2 at `https://data.videofreely.com` so the Cloudflare Pages deploy does not include 30 MB wasm assets.

## Packages

- `@ffmpeg/ffmpeg` 0.12.15, MIT license, https://github.com/ffmpegwasm/ffmpeg.wasm
- `@ffmpeg/core` 0.12.10, GPL-2.0-or-later license, https://github.com/ffmpegwasm/ffmpeg.wasm, hosted in R2
- `@ffmpeg/core-mt` 0.12.10, GPL-2.0-or-later license, https://github.com/ffmpegwasm/ffmpeg.wasm, hosted in R2

## Runtime Selection

The multi-thread core is preferred when the page is cross-origin isolated and `SharedArrayBuffer` is available. The current remote runtime paths are:

- `https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.js`
- `https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.wasm`
- `https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.worker.js`

The single-thread core remains as an automatic fallback:

- `https://data.videofreely.com/ffmpeg/0.12.10/core/ffmpeg-core.js`
- `https://data.videofreely.com/ffmpeg/0.12.10/core/ffmpeg-core.wasm`

The browser wrapper and its worker-side bundle are:

- `assets/vendor/ffmpeg/ffmpeg.js`
- `assets/vendor/ffmpeg/814.ffmpeg.js`

## Checksums

Generated with:

```sh
env LC_ALL=C shasum -a 256 assets/vendor/ffmpeg/*
curl -fsSL https://data.videofreely.com/ffmpeg/0.12.10/core/ffmpeg-core.js | shasum -a 256
curl -fsSL https://data.videofreely.com/ffmpeg/0.12.10/core/ffmpeg-core.wasm | shasum -a 256
curl -fsSL https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.js | shasum -a 256
curl -fsSL https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.wasm | shasum -a 256
curl -fsSL https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.worker.js | shasum -a 256
```

```text
94c104969ee578f2332a4a40eab983b837ebd88aa03d0af1f9fec5b45f8b3dcc  assets/vendor/ffmpeg/814.ffmpeg.js
535516558ba009816eac0b6935ff10b42d7d44ddc01bc85b1635bd412d4407b9  assets/vendor/ffmpeg/814.ffmpeg.js.map
def4cfbafd4f51a4007ef6c0cfdb9061554343327f31c704c6548414b2316b06  assets/vendor/ffmpeg/ffmpeg.js
535516558ba009816eac0b6935ff10b42d7d44ddc01bc85b1635bd412d4407b9  assets/vendor/ffmpeg/ffmpeg.js.map
b266ab5b952555881dd6310663986994a182acb2b7ff25cf10a25f7a37ac2b21  https://data.videofreely.com/ffmpeg/0.12.10/core/ffmpeg-core.js
9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7  https://data.videofreely.com/ffmpeg/0.12.10/core/ffmpeg-core.wasm
62f5f5f468a37861da12c4581c321bb5ca8ba2f7b776377e08dd2ab72de293f9  https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.js
be2c97605366b78f3f13e21b52e81a55a79e1f29c133b03a68ec187b1a2ec41a  https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.wasm
97322a227c5f3d5ccfd0d0825890a6deeba137106a09b633ca75cadf49ddd2cb  https://data.videofreely.com/ffmpeg/0.12.10/core-mt/ffmpeg-core.worker.js
```

When updating these files, update this notice and rerun the verification checklist in `README.md`.
