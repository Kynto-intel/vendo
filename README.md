# Vendo

**A personal Windows command center for Hermes Agent, built around voice interaction with Luzzy and an AI agent crew.**

> [!WARNING]
> **Experimental project: Vendo is still under active development and is not a mature, stable, or production-ready application.** Features may be incomplete, unreliable, or change without notice. Expect bugs, rough edges, and breaking changes. Do not depend on Vendo for critical work or irreversible actions. Back up important data and verify what the app or an AI agent is doing.

Vendo is a small personal project built for one Windows desktop setup. It brings a voice-first assistant, Hermes Agent conversations, local desktop tools, and personal workflows into one application. Hermes remains the AI and tool layer; Vendo provides the desktop interface and integrates selected capabilities. Some names, profiles, paths, and integrations may need adaptation for other setups.

The detailed user guide is currently in German: [README.md](README.md).

## Screenshot

![Vendo main screen](docs/images/vendo.png)

## What Vendo Does

- **Voice interaction:** Talk to Luzzy using speech recognition, an optional wake word, and text-to-speech. Pocket TTS can run locally; Gemini TTS and ElevenLabs are optional cloud services.
- **Agent crew:** Chat with Hermes profiles, manage bot profiles, and follow work as agents hand tasks to one another.
- **Personal workflows:** Use tasks, calendar events, reminders, focus sessions, routines, notes, and scheduled jobs in one place.
- **Shop and inbox notifications:** See new Shopify orders, incoming mail notifications, job failures, and order milestones.
- **Desktop tools:** Search and preview local files, dictate text, use a built-in PowerShell terminal, and trigger a limited set of PC controls.
- **Extensible interface:** Add local plugins for custom views, cards, commands, and workflows. The plugin workshop can draft and check plugins before installation.
- **Optional local fallback:** When configured, Ollama can provide limited local assistance if Hermes is unavailable. Cloud-backed features are not available in that mode.

Vendo is not a replacement for Hermes Agent, and it does not provide a hosted service or a mobile app.

## Project Status

Vendo is a personal project in active development. It has not been polished or validated as a general-purpose product. In particular:

- The interface, settings, plugin APIs, and local data formats may change.
- Some features depend on a specific Hermes Agent installation, profile configuration, credentials, or third-party services.
- Optional integrations may require additional setup and may stop working when their providers change.
- The repository does not promise stable releases, backward compatibility, or support for production use.
- AI output and automated actions can be wrong. Review results before acting on them.

Use a test environment for integrations that can affect a real shop or other important data. Keep independent backups of anything you cannot afford to lose.

## Requirements

- Windows 10 or 11
- Node.js LTS and npm
- A locally installed and configured Hermes Agent
- A Hermes profile configured for Vendo (the original setup uses the profile `donnerwolf`)

Microphone access, Pocket TTS, Ollama, Shopify, mail, and cloud TTS providers are optional and require their own configuration. Vendo does not bundle those services or credentials.

## Run Locally

```powershell
npm install
npm start
```

This starts the Electron application from source. There is currently no packaged installer or release process documented in this repository. Hermes Agent must be installed and configured separately.

## Data, Integrations, and Safety

- Vendo is designed for a local, single-user desktop setup. It connects to Hermes running on the same PC.
- Prompts sent to Hermes may be processed by the model provider configured in Hermes. Review that provider's data and privacy terms.
- Pocket TTS runs locally when configured. Gemini TTS and ElevenLabs send text to their respective providers for speech generation.
- Shopify, mail, weather, and other connected services may communicate with their providers. Their availability and data handling depend on the integration and its configuration.
- App settings and plugin data are intended to remain in the local `daten/` directory, which is excluded from Git. Do not commit credentials, tokens, personal data, or local backups.
- Vendo includes safeguards such as confirmation prompts for selected risky actions and backups before certain file edits. These safeguards are not a security audit and do not make experimental software risk-free.

Do not use real credentials in a shared test environment, and review permissions before connecting external services.

## Technology

Vendo is built with Electron and JavaScript. The renderer uses native browser technologies; the application connects to Hermes through its local API and WebSocket interfaces. The terminal uses xterm.js and node-pty.

## License

No license file is currently included. Do not assume that the code is licensed for reuse, modification, or redistribution.
