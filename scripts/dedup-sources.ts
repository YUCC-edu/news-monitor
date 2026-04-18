import {
  backfillAllDedupKeys,
  computeDedupKey,
  findDuplicateGroups,
  listItemCountsBySource,
  listSources,
  mergeSources,
  type Source,
  type SourceKind,
} from "@news/db";

function pickKeepId(group: Source[], countById: Map<string, number>): string {
  let best = group[0]!;
  let bestScore = -1;
  for (const s of group) {
    const n = countById.get(s.id) ?? 0;
    const score =
      (s.enabled ? 1_000_000_000 : 0) +
      n * 10_000 +
      s.name.length;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best.id;
}

/** Merge rows that map to the same (kind, computeDedupKey) before writing dedup_key. */
async function mergeByComputedKey() {
  const sources = await listSources();
  const counts = await listItemCountsBySource();
  const countById = new Map(counts.map((c) => [c.sourceId, c.count]));

  const groups = new Map<string, Source[]>();
  for (const s of sources) {
    const k = computeDedupKey(s.kind as SourceKind, s.config);
    const key = `${s.kind}::${k}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  let merged = 0;
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const keepId = pickKeepId(list, countById);
    const dropIds = list.filter((x) => x.id !== keepId).map((x) => x.id);
    if (dropIds.length === 0) continue;
    await mergeSources(keepId, dropIds);
    const kn = countById.get(keepId) ?? 0;
    const add = dropIds.reduce((a, id) => a + (countById.get(id) ?? 0), 0);
    countById.set(keepId, kn + add);
    for (const id of dropIds) countById.delete(id);
    merged += dropIds.length;
    console.log(`[dedup] merged by config key keep=${keepId} dropped=${dropIds.join(",")}`);
  }
  return { mergedSources: merged };
}

async function main() {
  const { mergedSources } = await mergeByComputedKey();
  console.log(`[dedup] mergeByComputedKey: mergedSources=${mergedSources}`);

  const bf = await backfillAllDedupKeys();
  console.log(`[dedup] backfill dedup_key: scanned=${bf.scanned} updated=${bf.updated}`);

  const dups = await findDuplicateGroups();
  console.log(
    JSON.stringify(
      {
        remainingDuplicateGroups: dups.length,
        groups: dups.map((g) => ({ kind: g.kind, dedupKey: g.dedupKey, n: g.sources.length })),
      },
      null,
      2,
    ),
  );
}

void main();
