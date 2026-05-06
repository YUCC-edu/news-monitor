import { upsertSource } from "@news/db";
import {
  buildSystemStatusSnapshot,
  capabilityCatalog,
  executeCapability,
  type CapabilityErrorPayload,
  type CapabilityName,
} from "@news/engine";
import { collectPresetItems, listPresetPacks } from "../apps/web/lib/source-presets";

type CliFlags = {
  json: boolean;
  quiet: boolean;
};

function readArgs(argv: string[]) {
  const flags: CliFlags = {
    json: argv.includes("--json"),
    quiet: argv.includes("--quiet"),
  };
  const args = argv.filter((arg) => arg !== "--json" && arg !== "--quiet" && arg !== "--");
  return { args, flags };
}

function takeOption(args: string[], name: string) {
  const index = args.findIndex((arg) => arg === name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string) {
  return args.includes(name);
}

function numberOption(args: string[], name: string) {
  const raw = takeOption(args, name);
  if (raw == null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringOption(args: string[], name: string) {
  const raw = takeOption(args, name);
  return raw == null ? undefined : raw;
}

function repeatedOption(args: string[], name: string) {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function imageReturnOptions(args: string[]) {
  return repeatedOption(args, "--image").map((raw) => {
    const sep = raw.indexOf("=");
    if (sep <= 0) throw new Error("--image must use slot=pathOrUrl");
    const slotId = raw.slice(0, sep).trim();
    const value = raw.slice(sep + 1).trim();
    if (!slotId || !value) throw new Error("--image must use slot=pathOrUrl");
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return { slotId, url: value };
    }
    return { slotId, localPath: value };
  });
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printSection(title: string, lines: string[]) {
  console.log(`\n${title}`);
  for (const line of lines) console.log(`  ${line}`);
}

function exitCodeForError(error: CapabilityErrorPayload) {
  switch (error.code) {
    case "invalid_input":
      return 2;
    case "dependency_unreachable":
    case "permission_denied":
      return 3;
    default:
      return 4;
  }
}

function printCapabilityResult(capability: CapabilityName, data: unknown, flags: CliFlags) {
  if (flags.json) {
    printJson({ capability, data });
    return;
  }
  if (capability === "system.status") {
    const status = data as Awaited<ReturnType<typeof buildSystemStatusSnapshot>>;
    const dependencyLines = [
      `ai_mode: ${status.env.llm.mode}`,
      `database: ${status.env.database.set ? "configured" : "missing"}`,
      `redis: ${status.env.redis.ok ? "ok" : status.env.redis.set ? "unreachable" : "missing"}`,
      `rsshub: ${status.env.rsshub.ok ? "ok" : status.env.rsshub.set ? "unreachable" : "missing"}`,
      `wewe: ${status.env.wewe.ok ? "ok" : status.env.wewe.set ? "unreachable" : "missing"}`,
      `llm: ${status.env.llm.enabled ? status.env.llm.hasKey ? "enabled" : "missing key" : "optional/off"}`,
    ];
    if (flags.quiet) {
      console.log(
        dependencyLines
          .map((line) => line.replace(": ", "="))
          .join(" "),
      );
      return;
    }
    printSection("Runtime", dependencyLines);
    printSection(
      "Queues",
      Object.entries(status.queues).map(([name, counts]) => {
        const c = counts ?? {};
        return `${name}: waiting=${c.waiting ?? 0} active=${c.active ?? 0} failed=${c.failed ?? 0} completed=${c.completed ?? 0}`;
      }),
    );
    return;
  }
  const payload = data as Record<string, unknown>;
  if (Array.isArray(payload.sources)) {
    console.table(
      payload.sources.map((row) => {
        const source = row as Record<string, unknown>;
        return {
          id: source.id,
          name: source.name,
          kind: source.kind,
          enabled: source.enabled,
          failCount: source.failCount,
        };
      }),
    );
    return;
  }
  if (Array.isArray(payload.hotspots)) {
    console.table(
      payload.hotspots.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: item.id,
          title: item.titleZh ?? item.title,
          source: item.sourceName,
          cluster: item.clusterTopic,
          relatedSources: item.relatedSourceCount ?? item.relatedCount,
        };
      }),
    );
    return;
  }
  if (Array.isArray(payload.clusters)) {
    console.table(
      payload.clusters.map((row) => {
        const cluster = row as Record<string, unknown>;
        return {
          id: cluster.id ?? cluster.clusterId,
          topic: cluster.topic,
          distinctSources: cluster.distinctSources ?? cluster.relatedSourceCount,
          itemsWindow: cluster.itemsWindow,
          hybridScore: cluster.hybridScore,
        };
      }),
    );
    return;
  }
  if (Array.isArray(payload.items)) {
    console.table(
      payload.items.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: item.id ?? item.itemId,
          title: item.titleZh ?? item.title,
          source: item.sourceName,
          platform: item.platform,
        };
      }),
    );
    return;
  }
  if ("queued" in payload) {
    console.log(`queued=${payload.queued}`);
    return;
  }
  printJson(data);
}

function capabilityUsage() {
  console.log("news-monitor CLI (nm)");
  console.log("");
  console.log("Commands:");
  console.log("  nm init [--import-preset <key>] [--json]");
  console.log("  nm config validate [--json]");
  console.log("  nm status [--json]");
  console.log("  nm sources list [--kind <kind>] [--enabled-only] [--json]");
  console.log("  nm sources add --kind <kind> --name <name> [--config <json> | kind-specific flags]");
  console.log("  nm sources update --id <uuid> --kind <kind> --name <name> [--config <json> | kind-specific flags]");
  console.log("  nm sources fetch --id <uuid> [--json]");
  console.log("  nm sources import-preset [--preset <key>] [--fetch] [--json]");
  console.log("  nm hotspots list [--range <24h|72h|7d|30d|90d>] [--limit <n>] [--json]");
  console.log("  nm hotspots explain --cluster-id <uuid> [--json]");
  console.log("  nm clusters list [--range <7d|30d|90d>] [--min-sources <n>] [--sort <hybrid|sources|items|recency|cohesion>] [--json]");
  console.log("  nm clusters siblings --cluster-id <uuid> [--exclude-item <uuid>] [--exclude-source <uuid>] [--json]");
  console.log("  nm items search <query> [--limit <n>] [--range <24h|72h|7d|30d|90d>] [--json]");
  console.log("  nm stats overview [--range <7d|30d|90d>] [--min-sources <n>] [--compare] [--json]");
  console.log("  nm reports agent-brief [--range <24h|72h|7d|30d|90d>] [--top-n <n>] [--json]");
  console.log("  nm reports wechat-draft --intent <text> [--topic <text>] [--mode prepare|complete] [--report-id <uuid>] [--image-provider agent-image2|http-api|none] [--image slot=pathOrUrl] [--json]");
  console.log("  nm queue status [--json]");
  console.log("  nm ai status [--json]");
  console.log("  nm ops reenrich --scope <source|window|item> [scope flags] [--json]");
  console.log("");
  console.log("Kind-specific source flags:");
  console.log("  rss/wechat-wewe: --url <feedUrl>");
  console.log("  hn: --query <query> [--points-min <n>]");
  console.log("  x-rsshub: --handle <account> [--display-name <name>]");
  console.log("");
  console.log("Available capabilities:");
  for (const entry of Object.entries(capabilityCatalog)) {
    console.log(`  ${entry[0]} - ${entry[1].summary}`);
  }
}

function parseSourceConfig(args: string[], kind: string) {
  const rawConfig = stringOption(args, "--config");
  if (rawConfig) {
    return JSON.parse(rawConfig) as Record<string, unknown>;
  }
  if (kind === "rss" || kind === "wechat-wewe") {
    const url = stringOption(args, "--url");
    if (!url) throw new Error("--url is required for rss/wechat-wewe");
    return { feedUrl: url };
  }
  if (kind === "hn") {
    const query = stringOption(args, "--query");
    if (!query) throw new Error("--query is required for hn");
    return {
      query,
      ...(numberOption(args, "--points-min") != null ? { pointsMin: numberOption(args, "--points-min") } : {}),
    };
  }
  if (kind === "x-rsshub") {
    const handle = stringOption(args, "--handle");
    if (!handle) throw new Error("--handle is required for x-rsshub");
    return {
      handle,
      ...(stringOption(args, "--display-name") ? { displayName: stringOption(args, "--display-name") } : {}),
    };
  }
  throw new Error(`unsupported kind: ${kind}`);
}

async function runCapability(capability: CapabilityName, input: unknown, flags: CliFlags) {
  const result = await executeCapability(capability, input);
  if (
    result.ok &&
    result.data &&
    typeof result.data === "object" &&
    "conflict" in result.data &&
    result.data.conflict
  ) {
    const message = `resource already exists (${capability})`;
    if (flags.json) {
      printJson({
        ok: false,
        capability,
        error: { code: "conflict", message },
        data: result.data,
      });
    } else {
      console.error(`[conflict] ${message}`);
    }
    process.exit(4);
  }
  if (!result.ok) {
    if (flags.json) {
      printJson(result);
    } else {
      console.error(`[${result.error.code}] ${result.error.message}`);
      if (result.error.recoveryHint) console.error(result.error.recoveryHint);
    }
    process.exit(exitCodeForError(result.error));
  }
  printCapabilityResult(capability, result.data, flags);
}

async function runInit(args: string[], flags: CliFlags) {
  const status = await buildSystemStatusSnapshot();
  const checks = {
    databaseConfigured: status.env.database.set,
    redisConfigured: status.env.redis.set,
    rsshubConfigured: status.env.rsshub.set,
    llmConfigured: status.env.llm.hasKey,
  };
  const importPreset = stringOption(args, "--import-preset");
  const result: Record<string, unknown> = {
    checks,
    suggestions: [],
  };
  const suggestions = result.suggestions as string[];
  if (!checks.databaseConfigured) suggestions.push("Set DATABASE_URL in .env");
  if (!checks.redisConfigured) suggestions.push("Set REDIS_URL in .env");
  if (!checks.rsshubConfigured) suggestions.push("Set RSSHUB_BASE in .env");
  if (!checks.llmConfigured) suggestions.push("Set LLM_API_KEY and model/base URL in .env");
  if (importPreset) {
    const presetKeys = new Set(listPresetPacks().map((pack) => pack.key));
    if (!presetKeys.has(importPreset as never)) {
      throw new Error(`unknown preset pack: ${importPreset}`);
    }
    const items = collectPresetItems({ presetKeys: [importPreset] });
    const created: string[] = [];
    for (const item of items) {
      const createdOrConflict = await upsertSource({
        kind: item.kind,
        name: item.name,
        config: item.config,
        enabled: true,
        fetchIntervalSec: item.fetchIntervalSec,
        initialFetchDays: item.initialFetchDays ?? null,
        maxItemAgeDays: item.maxItemAgeDays ?? null,
      });
      if (createdOrConflict && !("conflict" in createdOrConflict)) {
        created.push(createdOrConflict.id);
      }
    }
    result.importPreset = importPreset;
    result.createdSources = created.length;
  }

  if (flags.json) {
    printJson(result);
    return;
  }
  printSection("Environment", [
    `database configured: ${checks.databaseConfigured ? "yes" : "no"}`,
    `redis configured: ${checks.redisConfigured ? "yes" : "no"}`,
    `rsshub configured: ${checks.rsshubConfigured ? "yes" : "no"}`,
    `llm configured: ${checks.llmConfigured ? "yes" : "no"}`,
  ]);
  if (importPreset) {
    printSection("Preset import", [`preset=${importPreset}`, `createdSources=${String(result.createdSources)}`]);
  } else {
    printSection("Preset import", [
      "Optional: run `pnpm nm -- init --import-preset ai-hotspot-research` to load a default source pack.",
    ]);
  }
  if (suggestions.length > 0) {
    printSection("Next steps", suggestions);
  } else {
    printSection("Next steps", ["Run `pnpm nm -- status` and `pnpm nm -- hotspots list --json` to verify the engine is live."]);
  }
}

async function main() {
  const { args, flags } = readArgs(process.argv.slice(2));
  const [group, command] = args;
  if (!group || group === "help" || group === "--help" || group === "-h") {
    capabilityUsage();
    return;
  }

  if (group === "init") {
    await runInit(args.slice(1), flags);
    return;
  }
  if (group === "config" && command === "validate") {
    await runCapability("system.status", {}, flags);
    return;
  }
  if (group === "status") {
    await runCapability("system.status", {}, flags);
    return;
  }
  if (group === "sources" && command === "list") {
    await runCapability(
      "sources.list",
      {
        kind: stringOption(args, "--kind"),
        enabledOnly: hasFlag(args, "--enabled-only"),
      },
      flags,
    );
    return;
  }
  if (group === "sources" && (command === "add" || command === "update")) {
    const kind = stringOption(args, "--kind");
    const name = stringOption(args, "--name");
    if (!kind || !name) throw new Error("--kind and --name are required");
    const config = parseSourceConfig(args, kind);
    const input = {
      ...(command === "update" ? { id: stringOption(args, "--id") } : {}),
      kind,
      name,
      config,
      enabled: !hasFlag(args, "--disabled"),
      fetchIntervalSec: numberOption(args, "--interval") ?? 600,
      initialFetchDays: numberOption(args, "--initial-days") ?? 1,
      maxItemAgeDays: numberOption(args, "--max-age-days") ?? null,
    };
    await runCapability(command === "add" ? "sources.add" : "sources.update", input, flags);
    return;
  }
  if (group === "sources" && command === "fetch") {
    const sourceId = stringOption(args, "--id");
    if (!sourceId) throw new Error("--id is required");
    await runCapability("sources.fetch", { sourceId }, flags);
    return;
  }
  if (group === "sources" && command === "import-preset") {
    await runCapability(
      "sources.importPreset",
      {
        presetKey: stringOption(args, "--preset") ?? "ai-high-signal",
        fetchAfterImport: hasFlag(args, "--fetch"),
      },
      flags,
    );
    return;
  }
  if (group === "hotspots" && command === "list") {
    await runCapability(
      "hotspots.list",
      {
        limit: numberOption(args, "--limit") ?? 20,
        range: stringOption(args, "--range") ?? "7d",
        q: stringOption(args, "--q") ?? "",
      },
      flags,
    );
    return;
  }
  if (group === "hotspots" && command === "explain") {
    const clusterId = stringOption(args, "--cluster-id");
    if (!clusterId) throw new Error("--cluster-id is required");
    await runCapability("hotspots.explain", { clusterId }, flags);
    return;
  }
  if (group === "clusters" && command === "list") {
    await runCapability(
      "clusters.list",
      {
        limit: numberOption(args, "--limit") ?? 10,
        range: stringOption(args, "--range") ?? "7d",
        minSources: numberOption(args, "--min-sources") ?? 2,
        clusterSort: stringOption(args, "--sort") ?? "hybrid",
      },
      flags,
    );
    return;
  }
  if (group === "clusters" && command === "siblings") {
    const clusterId = stringOption(args, "--cluster-id");
    if (!clusterId) throw new Error("--cluster-id is required");
    await runCapability(
      "clusters.siblings",
      {
        clusterId,
        excludeItemId: stringOption(args, "--exclude-item"),
        excludeSourceId: stringOption(args, "--exclude-source"),
        limit: numberOption(args, "--limit") ?? 30,
      },
      flags,
    );
    return;
  }
  if (group === "items" && command === "search") {
    const positionalQuery = args.slice(2).filter((arg) => !arg.startsWith("--")).join(" ");
    await runCapability(
      "items.search",
      {
        q: stringOption(args, "--q") ?? positionalQuery,
        limit: numberOption(args, "--limit") ?? 20,
        range: stringOption(args, "--range") ?? "7d",
        sortBy: stringOption(args, "--sort") ?? "published",
      },
      flags,
    );
    return;
  }
  if (group === "stats" && command === "overview") {
    await runCapability(
      "stats.overview",
      {
        range: stringOption(args, "--range") ?? "7d",
        minSources: numberOption(args, "--min-sources") ?? 2,
        compare: hasFlag(args, "--compare"),
        topN: numberOption(args, "--top-n"),
      },
      flags,
    );
    return;
  }
  if (group === "reports" && command === "agent-brief") {
    await runCapability(
      "reports.agentBrief",
      {
        audience: stringOption(args, "--audience") ?? "personal",
        range: stringOption(args, "--range") ?? "24h",
        topN: numberOption(args, "--top-n") ?? 10,
        minSources: numberOption(args, "--min-sources") ?? 1,
        reportDate: stringOption(args, "--report-date"),
        timezone: stringOption(args, "--timezone") ?? "Asia/Shanghai",
      },
      flags,
    );
    return;
  }
  if (group === "reports" && command === "wechat-draft") {
    await runCapability(
      "wechatDraft.create",
      {
        intent: stringOption(args, "--intent") ?? "最近热点内容",
        topic: stringOption(args, "--topic"),
        audience: stringOption(args, "--audience") ?? "personal",
        range: stringOption(args, "--range") ?? "24h",
        topN: numberOption(args, "--top-n") ?? 10,
        minSources: numberOption(args, "--min-sources") ?? 1,
        mode: stringOption(args, "--mode") ?? "prepare",
        reportId: stringOption(args, "--report-id"),
        imageProvider: stringOption(args, "--image-provider") ?? "agent-image2",
        images: imageReturnOptions(args),
        allowWebSupplement: hasFlag(args, "--allow-web-supplement"),
      },
      flags,
    );
    return;
  }
  if (group === "queue" && command === "status") {
    await runCapability("queue.status", {}, flags);
    return;
  }
  if (group === "ai" && command === "status") {
    await runCapability("ai.status", {}, flags);
    return;
  }
  if (group === "ops" && command === "reenrich") {
    const scope = stringOption(args, "--scope");
    if (!scope) throw new Error("--scope is required");
    await runCapability(
      "ops.reenrich",
      {
        scope,
        sourceId: stringOption(args, "--source-id"),
        itemId: stringOption(args, "--item-id"),
        since: stringOption(args, "--since"),
        until: stringOption(args, "--until"),
        limit: numberOption(args, "--limit") ?? 200,
      },
      flags,
    );
    return;
  }

  capabilityUsage();
  process.exit(2);
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  });
