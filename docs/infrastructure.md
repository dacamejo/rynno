# Infrastructure Strategy

For the MVP we run everything on Render to keep the stack simple and scalable, then revisit multi-provider architecture later.

## Hosting (Render)
- **Services:** deploy the backend API as a Render Web Service (Node/Go/Python as needed) with auto-deploy from the `main` branch.
- **Cron jobs:** use Render Cron Jobs for parsing/playlist reminder workers—each job can trigger the same codebase with different entrypoints.
- **PostgreSQL:** start with Render Managed PostgreSQL (dev tier) and scale it as usage grows; configure automated backups and set up read-replicas when we need analytics.
- **Secrets & env:** store Spotify/Google/SBB credentials via Render Environment Groups; avoid leaking secrets in repo.
- **Static assets:** host the PWA frontend on Render Static Site (or use the same Web Service) and distribute via Render CDN for mobile performance.
- **Scalability:** Render auto-scales web services by CPU/memory usage; we can horizontally scale the backend service across regions if needed, and add autoscaling to Cron Jobs.

## Data & persistence
- **Schema:** store canonical trips, playlist metadata, and user preferences in Postgres. Use migrations (Drizzle/Knex/Flyway) run during deploy. Keep topology simple initially (single schema) and add read-replicas later.
- **Caching:** add Redis (via Render Redis or external) if we need rate-limiting or session caching, but defer until we identify hotspots.

## Observability & automation
- **Logging:** Render logs plus optional external log drain (e.g., Logflare or Datadog) for production incidents.
- **Health checks:** configure Render health checks on the parser endpoints so deployments fail fast when the share-target parsing breaks.
- **CI/CD:** use Render’s GitHub integration for auto-deploy + GitHub Actions for tests/migrations; also deploy feature branches to Preview environments when needed.

## Future evolution
- Keep dual-database option open (Aiven/Supabase) by allowing the backend to switch connection strings via Render env vars. If we outgrow Render Postgres or need multi-region, we can migrate without touching the rest of the stack.
- Consider a native mobile wrapper once the backend/playlist builder is stable (see `docs/roadmap.md`).
