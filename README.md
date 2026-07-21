# ProofMode

**ProofMode asks whether a product delivers the experience it promises.** It turns plain-language claims into constrained browser tests, executes them, captures evidence, and produces reproducible verdicts: Verified, Failed, Partial, or Inconclusive.

## The problem

Traditional monitoring asks whether a page responds or a test suite stays green. Product claims are higher-level promises that often cross interface states. ProofMode bridges that gap while refusing to mark a promise verified without observable evidence.

## How it works

1. A user enters an HTTP(S) URL, up to three claims, and optional instructions.
2. GPT-5.6 interprets each claim and returns a Zod-validated plan of approved actions.
3. Playwright executes only `goto`, `click`, `fill`, `press`, `wait`, `assert_text`, `assert_url`, `assert_visible`, and `screenshot`.
4. The executor records URLs, durations, screenshots, failures, observations, and browser console errors.
5. GPT-5.6 evaluates the explicit success criteria against that evidence and returns a structured verdict.
6. ProofMode stores artifacts locally and renders an evidence-first report that downloads as JSON.

GPT-5.6 is necessary because claims such as “signup produces a confirmation” require interpretation, assumptions, appropriate success criteria, and synthesis across heterogeneous observations. Deterministic Playwright remains responsible for every browser action; the model never emits executable code.

## Built with Codex and GPT-5.6

Codex helped scaffold, implement, debug, test, and document this project. The factual sequence is recorded in [BUILD_LOG.md](./BUILD_LOG.md). GPT-5.6 powers claim interpretation, structured test planning, and evidence evaluation. Playwright performs constrained browser actions, and final verdicts are tied to captured evidence.

## Architecture

```text
Next.js UI → POST /api/runs → GPT-5.6 planner → Zod plan
                                  ↓
JSON report ← GPT-5.6 evaluator ← Playwright evidence
                                  ↓
                       artifacts/runs/<run-id>/
```

The App Router hosts the workbench, report, `/demo-target`, Node API orchestration, and artifact-serving routes. There is no database or authentication.

## Setup

Requirements: Node.js 20+, npm, a supported Playwright/Chromium platform, and an OpenAI API key for live mode.

```bash
npm install
npx playwright install chromium
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Environment variables:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
APP_BASE_URL=http://localhost:3000
```

The API key is read only by Node routes. Without it, runs return the clearly labeled pre-generated sample report; “View sample report” explicitly opens the same fallback.

## Judge the built-in demo

1. Start the app and click **Load demo**.
2. The form fills the local `/demo-target` URL, three representative claims, and testing guidance.
3. Add `OPENAI_API_KEY` and click **Run verification** for a live GPT-5.6 run.
4. Inspect the step timeline, console errors, screenshots, supporting/contradicting evidence, and suggested fix.
5. Download the JSON report.

The demo intentionally accepts invalid emails, hides its success message, uses a mouse-only important button, and logs a controlled submission error. It exists to create stable, inspectable failures.

## Commands

```bash
npm run dev        # development
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm test           # unit tests
npm run test:smoke # demo browser test
npm run build      # production build
npm start          # production server
```

## Security and limitations

- Only HTTP and HTTPS URLs are accepted; localhost is intentionally supported for the hackathon.
- Claims, instructions, plan steps, browser timeouts, and request duration are bounded.
- Model output is schema-validated and cannot execute JavaScript or shell commands.
- This MVP does not provide network egress allowlists, authentication, multi-tenancy, secrets redaction, CAPTCHA handling, email inbox access, or durable queues. Do not expose it publicly without SSRF protections and worker isolation.
- Sites requiring complex authentication, visual judgment, downloads, multiple tabs, or non-browser systems may be Inconclusive.

## Future improvements

Add network allowlists, isolated workers, signed artifacts, multimodal screenshot evaluation, reusable fixtures, authenticated test vaults, queued execution, report diffing, CI integrations, and printable reports.

## Hackathon judging alignment

ProofMode is a developer tool with a concrete loop judges can inspect end-to-end. GPT-5.6 handles the two reasoning-heavy boundaries—turning promises into explicit plans and weighing captured evidence—while deterministic code enforces safety and reproducibility. The same repository includes a polished controlled target, offline report mode, public data contracts, and exact judging steps.
