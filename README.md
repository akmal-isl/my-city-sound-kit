# My City Sound Kit

A physical + digital cultural product for discovering, recording and remembering everyday city sounds.

## Product experience

**See → Imagine → Listen → Record → Remember**

Users can create a personal sound archive, record through their browser microphone or upload audio, attach a place, feeling, story and optional photo, and create a QR link for recordings they explicitly make public.

## Stack

- Static frontend: HTML, CSS and JavaScript
- Backend: Supabase Auth, PostgreSQL and Storage
- QR codes: QRCode.js
- Browser recording: MediaRecorder API

## Supabase setup

The project uses the Supabase project configured in `config.js`.

Database:
- `public.recordings` stores recording metadata.
- Row Level Security keeps recordings private by default.
- Only recordings with `is_public = true` can be read by anonymous visitors.

Storage:
- `sound-audio` and `sound-photos` are private buckets.
- Upload paths follow `<user_id>/<recording_id>/<filename>`.
- Storage policies restrict uploads and private reads to the owner; public playback is allowed only when the linked recording is public.

## Run locally

Serve this directory over localhost (microphone recording requires a secure context such as HTTPS or localhost). For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

The repository can be deployed as a static site using GitHub Pages or another static host. Configure the site URL in Supabase Auth redirect settings before enabling production sign-in flows.

## Security notes

- `config.js` contains only the Supabase project URL and publishable key. Publishable keys are intended for browser use and are protected by RLS.
- Never put a Supabase service-role key or secret key in frontend code.
- Audio and photo buckets are private. Public links are generated only for recordings marked public.
- Review Supabase Auth email confirmation and redirect URL settings before public launch.
