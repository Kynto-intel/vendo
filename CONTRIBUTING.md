# Contributing to Vendo

Thanks for your interest in contributing. Vendo is a small personal project, and contributions are welcome.

## Before You Start

- For a bug report, include the steps to reproduce it, what you expected, and what happened. Remove personal data, tokens, and other secrets from logs or screenshots.
- For a substantial feature or change, open an issue first so the scope can be discussed before you invest time in it.
- Keep pull requests focused. Explain the user-visible change and mention any limitations or setup requirements.

## Development Setup

Vendo runs on Windows with Node.js LTS, npm, and a separately installed Hermes Agent.

```powershell
npm install
npm start
```

There is no general automated test command configured yet. Run `git diff --check`, start Vendo, and manually verify the area affected by your change. If your change adds or updates a test, include how to run it in the pull request.

## Code and Documentation

- Follow the existing JavaScript, HTML, and CSS style in the surrounding files.
- Prefer small changes that fit the current Electron and plugin architecture.
- Update the public README when user-visible behavior, setup, or requirements change.
- Explain new dependencies and why they are needed.
- Do not include generated output, local settings, personal files, credentials, tokens, or customer data.

## Pull Requests

1. Fork the repository and create a branch for your change.
2. Make the change and verify the affected workflow locally.
3. Open a pull request with a short summary, relevant screenshots for UI changes, and the checks you ran.
4. Make sure every contribution is your own work or that you have permission to submit it. Contributions accepted into Vendo are distributed under the repository's license.

Please be respectful and constructive in issues and reviews. Thanks for helping improve Vendo.
