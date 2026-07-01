# Video Freely

Video Freely is a free browser video and audio converter powered by FFmpeg WebAssembly.

Live site: https://videofreely.com/

Selected files stay on the user's device. The app does not upload media to a server.

## Features

- Convert to MP4, WebM, GIF, MP3, M4A, WAV, and JPG still frames.
- Adjust quality, max width, frame rate, audio bitrate, trim range, mute, and output name.
- Preview the selected file before converting.
- Use preset conversions or advanced FFmpeg command mode.
- Uses a faster multi-thread FFmpeg core when the browser supports it, with a single-thread fallback.

## Run Locally

Use the included local server when testing conversion, because the multi-thread FFmpeg core needs cross-origin isolation headers:

```sh
python3 tools/serve.py
```

Then open `http://localhost:4174`.

For a plain static-server smoke test:

```sh
python3 -m http.server 4174
```

The plain server can still use the single-thread fallback.

## Notes

- Large files are limited by browser memory.
- FFmpeg loads only when a conversion starts, so the first conversion may take longer.
- The larger FFmpeg runtime files are loaded from `https://data.videofreely.com/ffmpeg/0.12.10/`.
- Source map 404s for vendored FFmpeg files are harmless; the source maps are not required at runtime.

## Vendor Libraries

Vendored versions, upstream links, and license notes are in `assets/vendor/NOTICE.md`.

## License

CC0-1.0. See `LICENSE`.
