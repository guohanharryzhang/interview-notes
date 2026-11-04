# Interview notes

A local website for interview preparation, live transcription, and answer notes drawn from your own experience. It runs on your computer and uses your OpenAI API key for transcription and generated answers.

The repository includes application code and fictional examples. It ships with **no candidate history, transcripts, API keys, resumes, or saved interview profiles**.

## Quick start

Install [Node.js 22 or newer](https://nodejs.org/en/download). Use Chrome for audio capture; Mac system-audio capture depends on your browser and macOS support. Typed questions do not require microphone or screen permissions.

1. Download and unzip the latest release, or clone this repository. Open a terminal in the extracted project folder.
2. Run:

   ```sh
   npm ci
   npm run setup
   npm start
   ```

3. Open **http://127.0.0.1:4319**. Click **Setup**, enter the company and role, and add your own OpenAI API key. You need API access and billing; a ChatGPT subscription does not include API usage.

Keep the terminal running. Press **Ctrl+C** there to stop the server. The optional `npm run launch` command starts it in the background and opens the browser; use the foreground command above if you want simple start/stop control.

There is no build step and no database service to install. This is a local Node application; GitHub Pages cannot run its backend. The localhost address only works on the computer running it.

## Add your background

Setup creates `.runtime/experience.json`, initially empty. Edit that file using a text editor. Follow [the fictional example](examples/experience.example.json) and [profile format guide](docs/profile-format.md). Replace examples with your own facts; do not present the fictional material as your experience.

The useful ingredients are:

- Your education and relevant logistics.
- Jobs, research, projects, teaching and other experiences.
- What you personally did, the tools you used, and the results you can explain.
- Technical details, team ownership and any limits on a numerical claim.
- Tags such as `software`, `hardware`, `embedded`, `research` or `general`, which help rank examples for a role.

Restart the server after editing experience files. The app loads them at startup. Your interview settings are edited in the browser and saved separately for each company and role.

For detailed experience notes, see [experience-supplement.example.json](examples/experience-supplement.example.json). For the six prewritten topic buttons, see [call-profiles.example.json](examples/call-profiles.example.json). Both are optional; the profile guide explains where to put them. This release uses JSON files for background information; it does not automatically extract a resume.

## Use the app

- **Setup:** company, role, job description, interview stage, company research, your reason for applying, model choices and API key.
- **Topic buttons:** introduction, motivation, project, mistake, disagreement and questions to ask. Matching saved answers open immediately; otherwise the app generates notes from your profile.
- **Start listening:** capture microphone audio, computer audio, or both. For a phone call on speaker, use microphone only. For supported Mac capture, choose Entire Screen and enable Share system audio in Chrome's chooser. Check both meters before relying on it.
- **Auto answers:** suggest notes when a transcript segment looks like a question. This is a heuristic and does not identify speakers. Turn it off to choose questions yourself.
- **Hold:** keep the current answer visible while transcription continues.
- **Type or edit a question:** ask directly, correct recognition errors, or combine a split question. Command+Enter submits; Escape cancels generation.
- **Spoken version / Deep dive:** change the level of explanation. Review factual claims before using them.
- **Reference → Download session:** export the captured transcript and separately labeled generated suggestions as JSON. Generated suggestions are not a record of what you said.

Pause stops audio capture. A page reload discards the in-memory session, so download it first if you want to keep it. No audio recording is saved. Use recording/transcription with participants' permission and in accordance with the interview's rules.

## API key and costs

Add the key through Setup or provide `OPENAI_API_KEY` in the server environment. The key is never returned by the configuration endpoint or put in browser storage.

On macOS, Setup saves it to a dedicated Keychain item named `Interview Notes OpenAI`. If Keychain is unavailable, the entered key is kept only until the server stops. On other operating systems, use the environment variable or enter it again each session. An environment key takes precedence on startup. `.env` files are ignored by Git but are **not loaded automatically**.

Default answer models are `gpt-5.4-mini` and `gpt-5.4` for Deep dive. Setup offers `gpt-4.1-mini` as an alternative for normal answers. Transcription defaults to `gpt-live-transcribe`, with `gpt-4o-mini-transcribe` and `gpt-4o-transcribe` alternatives. Availability depends on your API project. If a model is unavailable, select an available option; errors are shown explicitly. Deep dive currently requires access to its configured default model.

Local reference lookup and saved prepared answers do not call the API. Live transcription and generated answers incur your provider's usage charges. No API key or billing account is included with the download.

## Privacy

Your background and settings are stored locally under `.runtime/`, which is excluded from Git. Transcripts and generated answers remain in browser memory unless you download them.

While listening, audio from the selected sources is sent to OpenAI. For generated answers, the question, relevant background, experience summaries, job context and recent conversation are sent to OpenAI. Screen video is not transmitted or saved. API requests use `store: false` where supported by the answer endpoint; this does not promise zero provider retention. Check your provider's data controls.

The server listens only on `127.0.0.1`. Browser-origin checks and a per-process token protect writes and paid requests. Static files are served from an explicit allowlist. Do not expose this local server through a public tunnel without adding appropriate authentication and deployment security.

Before sharing your own fork or ZIP, exclude `.runtime/`, `.env*`, logs, session downloads and any personal files you added. Git ignore rules do not protect files you deliberately force-add or manually archive. See [SECURITY.md](SECURITY.md).

## Troubleshooting

| Problem | Action |
|---|---|
| Port is in use | Stop your earlier copy, or run `PORT=4320 npm start` on macOS/Linux. In PowerShell use `$env:PORT=4320; npm start`. Open the printed address. |
| No system-audio option | Use a supported browser/OS combination. Microphone-only capture remains available. The app will not silently substitute the microphone for system audio. |
| Permission was denied | Allow the browser's microphone and screen/system-audio access in OS settings, then try again. |
| Key is configured but API calls fail | Check API billing, model access and the displayed provider error. |
| Wrong background appears | Check `.runtime/experience.json` and optional profile files, then restart. `EXPERIENCE_DATABASE` overrides the default file path when set. |
| Prepared answers do not appear | Company and role must match your saved call profile. See the profile guide. |
| Answer invents details | Correct the source notes, preserve ownership/limits, and review generated text. Prompts discourage invention but do not guarantee accuracy. |

## Development

```sh
npm ci
npx playwright install chromium
npm test
```

Tests use mock providers and synthetic audio; they make no paid API requests and do not use your signed-in browser profile. Browser tests use the installed Chrome by default. To use downloaded Chromium, run `TEST_BROWSER=chromium npm test` on macOS/Linux or set that environment variable in PowerShell. Tests cover audio routing, cleanup, setup, retrieval, request protection and session export. They do not establish actual room acoustics, physical device capture or live API performance on another machine.

The backend is Node.js with `ws`; the frontend is plain JavaScript, CSS and Web Audio. Provider calls live in `src/provider.mjs`; profile loading and retrieval live in `src/data.mjs`, `src/context.mjs` and `src/knowledge.mjs`.

Licensed under [MIT](LICENSE).
