# Profile format

The app starts empty. All files below belong in `.runtime/` inside your local project folder. That directory is excluded from Git. Files in `examples/` are fictional documentation and are not loaded automatically.

## Required background file: experience.json

`npm run setup` creates a blank version without overwriting an existing profile. Edit it and restart the server. JSON requires double quotes and does not support comments or trailing commas.

| Field | Purpose |
|---|---|
| `owner` | Your preferred name, or a generic label if you prefer. |
| `profile.education` | Your actual education, coursework context or graduation information. |
| `profile.logistics` | Optional availability and preferences. Only enter facts you want used in answers. |
| `entities` | Jobs, projects, research and activities. Each needs a unique string `id`. |
| `claims` | Concrete statements about an entity, linked by `entity_id`. |
| `metrics` | Optional supported numerical results, linked by `entity_id`. |
| `skills` | Named skills with references to supporting claims. |
| `coursework` | Optional courses, terms and completion status. |

Example structure for an experience:

```json
{
  "id": "project-one",
  "name": "Your project name",
  "organization": "Your organization",
  "title": "Your role",
  "dates": {"display": "Your actual dates"},
  "aliases": ["a short name you use for the project"],
  "tags": ["software"]
}
```

Recognized ranking tags are `software`, `hardware`, `embedded`, `research`, and `general`. Use more than one when appropriate. The app also uses the text of your experience to rank it. Specific project names or aliases can override general role ranking.

A claim explains your work:

```json
{
  "id": "project-one-testing",
  "entity_id": "project-one",
  "text": "Describe what you personally built, investigated or tested.",
  "ownership": "Your contribution, including what teammates did.",
  "skills": ["An actual tool you used"],
  "scope_notes": ["Any important limits or context."],
  "sources": ["Your own notes or a relevant project reference."]
}
```

Keep `scope_notes`, `sources`, `skills`, `aliases` and `tags` as arrays of strings where shown. Do not put API keys or account passwords anywhere in a profile. Model output is not a source for a new personal fact.

For metrics, preserve what was measured, the baseline, the period and whether it was an individual or team result. If you do not have a supported number, omit it.

## Optional: experience-supplement.json

Use this for detailed technical notes, specific behavioral examples and follow-up preparation. Its top-level keys must match entity IDs in `experience.json`. See the fictional [supplement example](../examples/experience-supplement.example.json).

- `pitch` and `overview` describe the project and your contribution.
- `behavioralTopics` contains phrases that should match this story.
- `observations` contains objects with `id`, `text`, `source` and `scope`.
- `answerExampleIds` selects observations to include in the compact cross-project index.
- `followUps` and `gaps` contain questions you want to prepare.

These details may be sent to the answer provider when generating notes. Exclude confidential material you cannot share with that provider.

## Optional: call-profiles.json

This is an array of profiles for specific interviews. Start from [the template](../examples/call-profiles.example.json), replace all bracketed text, and save your private copy to `.runtime/call-profiles.json`.

The profile's `company` and `role` must match Setup, ignoring case and surrounding whitespace. A company-only profile can omit the role and acts as a fallback for that company. An exact role match takes precedence.

`preparedAnswers` supports six keys: `intro`, `why`, `project`, `failure`, `conflict`, `questions`. Each has a `question` and `text`. Clicking its button shows this saved text without an API request. If an answer is absent, the app uses normal generation.

`experienceOrder` optionally orders entity IDs for that interview. `ask` contains your questions for the interviewer. `qa` may be left empty; advanced entries use `q`, `beats` (an array of strings), `dont`, and optional source links.

## Changing files and keeping them private

After changes, stop the terminal with Ctrl+C and run `npm start` again. Browser-edited interview settings are saved immediately and do not need a restart.

You may set `EXPERIENCE_DATABASE` to an explicit alternative JSON path. If that file is missing or invalid, startup reports an error instead of loading another person's data.

The GitHub release ZIP contains only tracked project files. If you manually ZIP your working folder after personalization, you must exclude `.runtime/`, `.env*`, logs and session downloads yourself.
