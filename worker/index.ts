import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { prematchDue, runScan } from "../lib/scanner";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
  // Daily value scan (see triggers in vite.config.ts). Errors are recorded in scanner_runs.
  // "40 2-23/3 * * *": full scan every 3 hours. "10 * * * *": pre-kickoff refresh (line-ups, closing odds) only when a match is about to start.
  async scheduled(controller: ScheduledController, _env: Cloudflare.Env, ctx: ExecutionContext) {
    if (controller.cron === "10 * * * *") ctx.waitUntil(prematchDue().then(due => (due ? runScan("prematch") : undefined)).catch(() => undefined));
    else ctx.waitUntil(runScan("cron").catch(() => undefined));
  },
};

export default worker;
