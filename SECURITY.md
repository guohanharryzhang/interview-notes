# Privacy and security

This is a local, single-user application. Keep it bound to localhost. It is not a hosted multi-user service.

- Do not commit API keys, candidate profiles, transcripts, resumes or logs.
- Private runtime files belong in `.runtime/`, which is ignored by Git.
- Keys entered in Setup use the dedicated macOS Keychain item when available; otherwise they live in server memory. Environment keys are also supported.
- API calls send audio or selected interview context to the configured provider. Local execution does not mean offline transcription or offline generation.
- The app does not save audio. Exported session JSON includes transcript text and generated suggestions; treat that download as personal information.
- Generated suggestions are not proof of what a person said or did.
- Origin/host checks and request tokens reduce cross-site abuse of the local service. They do not protect against malicious software running under your own OS account.

If you accidentally publish a key, revoke it with the provider. Deleting it in a new commit does not remove it from earlier Git history.

When reporting a bug, include a minimal fictional example. Remove keys, tokens, transcripts and personal details from logs or screenshots. Do not post a vulnerability containing private data in a public issue.
