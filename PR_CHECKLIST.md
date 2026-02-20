# PR Readiness Checklist

Use this checklist before requesting review to keep the project predictable and easy to ship.

## Testing & quality
- [ ] Run the relevant automated tests (`npm test`, `npm run lint`, etc.) or justify why the changes are purely documentation.
- [ ] Confirm `npm run lint` or equivalent passes without new warnings/errors.
- [ ] Validate key user flows manually if behavior changes (playlist building, trip parsing, reminder scheduling).

## Documentation
- [ ] Update or add docs for any new heuristics, features, or operational changes (e.g., playlist heuristics, parser spec, onboarding flow, Render infra).
- [ ] Link to relevant docs from README, docs index, or release notes when the change affects onboarding or infrastructure.
- [ ] Document any new environment variables, cron schedules, or secrets in `docs/infrastructure.md` or `docs/operations.md`.

## Release & deployment
- [ ] Confirm migrations (if any) are described and backwards-compatible; include migration scripts in the PR.
- [ ] Note any Render service changes (Cron jobs, new web services, new environment groups) and update deployment notes.

## Review readiness
- [ ] Split large PRs into focused commits with descriptive messages.
- [ ] Mention any areas needing reviewer focus (security, heuristics, onboarding copy) in the PR description.
- [ ] Ensure no TODOs or `console.log` remnants remain in production code unless explicitly flagged.

## Optional (good to have)
- [ ] Add metadata (labels, severity, milestone) if your repo workflow relies on it.
- [ ] Attach screenshots or recordings for UI changes.
- [ ] Sync with teammates/stakeholders if the change impacts multiple systems (e.g., playlist builder heuristics used by analytics).
