# Infrastructure Strategy

For the MVP we run everything on Render to keep the stack simple and scalable, then revisit multi-provider architecture later.

## Hosting (Render)
- **Services:** deploy the backend API as a Render Web Service (Node/Go/Python as needed) with auto-deploy from the `main` branch. Split responsibilities across `api-backend` (HTTP endpoints + playlist builder) and `parser-worker` (shared link parsing, heuristics, and webhook handlers) services so we can scale independently.
- **Regions & failover:** start with Render’s `iad` region and add `eu` when we need lower latency for European trips. Use Render’s deployment health checks plus synthetic pings to detect silent failures.
- **Cron jobs:** use Render Cron Jobs for parsing/playlist reminder workers—each job can trigger the same codebase with different entrypoints. Cron jobs run `parse-trip --share` hourly and `reminder-dispatch --upcoming` every 15 minutes, with load caps defined via concurrency settings.
- **PostgreSQL:** start with Render Managed PostgreSQL (dev tier) and scale it as usage grows; configure automated backups, PITR snapshots, and set up read-replicas when we need analytics. Tag the database with the service name (e.g., `rynno-playlists-prod`) to match security policies.
- **Secrets & env:** store Spotify/Google/SBB credentials via Render Environment Groups; avoid leaking secrets in repo. Manage API quotas via environment toggles (e.g., `SPOTIFY_RATE_LIMIT=50`) so we can throttle without code changes.
- **Static assets:** host the PWA frontend on Render Static Site (or use the same Web Service) and distribute via Render CDN for mobile performance. Pair the static site with Render-provided TLS certs and HTTP/2.
- **Scalability:** Render auto-scales web services by CPU/memory usage; we can horizontally scale across regions if needed, and add autoscaling to Cron Jobs. Track CPU throttling and queue backlog to determine when to bump instance counts.

## Security & reliability guardrails
- **TLS & certs:** enforce HTTPS via Render’s load balancer, and regenerate certificates automatically. Redirect HTTP to HTTPS at the CDN edge to avoid mixed content.
- **Network controls:** restrict inbound connections using Render’s private services when connecting to the Postgres instance. Use VPC peering for Redis or other managed services if we raise the security bar.
- **Secrets rotation:** rotate credentials quarterly or after key team changes. Use Render’s Dashboard API/CLI to sync secrets and mark rotations in release notes.
- **Incident readiness:** tie Render alert webhooks (deployment failures, unhealthy services) to Slack or PagerDuty. Document playbooks for `parser-worker` timeouts or plateaued playlist builder runs.

## Data & persistence
- **Schema:** store canonical trips, playlist metadata, user preferences, and heuristics state in Postgres. Use migrations (Drizzle/Knex/Flyway) run during deploy. Keep topology simple initially (single schema) and add read-replicas later.
- **Caching:** add Redis (via Render Redis or an external provider) if we need rate-limiting or session caching, but defer until we identify hotspots. Cache parser results (per share URL) for 5 minutes to avoid repeated API calls.
- **Backups & retention:** enable nightly backups plus PITR for at least 7 days. Regularly test restores in a staging project to confirm procedures.

## Observability & automation
- **Logging & tracing:** centralize Render logs, and ship them to an external log drain (Logflare, Datadog, or similar) for searchable incidents. Integrate lightweight tracing (OpenTelemetry) to tag playlist builder runs with `tripId` for debugging.
- **Metrics & dashboards:** track key metrics such as parse success rate, playlist guardrail failures, Spotify API latency, and reminder dispatch rates. Surface these in Grafana (via Prometheus push gateway) or Render metrics boards.
- **Health checks & retries:** configure Render health checks on parser endpoints so deployments fail fast when share-target parsing breaks. Add exponential backoff retries in cron jobs for transient failures.
- **CI/CD:** use Render’s GitHub integration for auto-deploy plus GitHub Actions for tests/migrations. Deploy feature branches to Render Preview environments and gate production releases on manual approval.

## Cost & disaster readiness
- **Budget controls:** set Render instance limits and database sizing alerts to avoid runaway billing when cron jobs spike. Monitor API usage (Spotify/Google) via dashboards and throttle when approaching quotas.
- **Disaster recovery:** document a postmortem process for regional outages. Keep infrastructure-as-code templates handy (Render YAML) so we can repro services quickly in a new account or region.

## Future evolution
- Keep dual-database option open (Aiven/Supabase) by allowing the backend to switch connection strings via Render env vars. If we outgrow Render Postgres or need multi-region, we can migrate without touching the rest of the stack.
- Consider a native mobile wrapper once the backend/playlist builder is stable (see `docs/roadmap.md`).
