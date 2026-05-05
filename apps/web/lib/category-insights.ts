export type CategoryDimension = "domain" | "topic" | "entity";

export type CategoryInsightItem = {
  id: string;
  sourceName: string;
  categoryDomain?: string[] | null;
  categoryTopic?: string[] | null;
  categoryEntity?: string[] | null;
};

export type CategoryInsightRow = {
  value: string;
  itemCount: number;
  sourceCount: number;
  itemIds: string[];
};

type MutableRow = CategoryInsightRow & {
  sourceNames: Set<string>;
  itemIdSet: Set<string>;
};

const dimensions = ["domain", "topic", "entity"] as const satisfies CategoryDimension[];

function normalizeValues(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function valuesForDimension(item: CategoryInsightItem, dimension: CategoryDimension) {
  if (dimension === "domain") return normalizeValues(item.categoryDomain);
  if (dimension === "topic") return normalizeValues(item.categoryTopic);
  return normalizeValues(item.categoryEntity);
}

function emptyRows() {
  return {
    domain: new Map<string, MutableRow>(),
    topic: new Map<string, MutableRow>(),
    entity: new Map<string, MutableRow>(),
  };
}

function addRows(
  bucket: Map<string, MutableRow>,
  values: string[],
  item: CategoryInsightItem,
) {
  for (const value of values) {
    const row = bucket.get(value) ?? {
      value,
      itemCount: 0,
      sourceCount: 0,
      itemIds: [],
      sourceNames: new Set<string>(),
      itemIdSet: new Set<string>(),
    };
    row.sourceNames.add(item.sourceName);
    row.itemIdSet.add(item.id);
    row.sourceCount = row.sourceNames.size;
    row.itemIds = [...row.itemIdSet];
    row.itemCount = row.itemIds.length;
    bucket.set(value, row);
  }
}

function freezeRows(bucket: Map<string, MutableRow>) {
  return [...bucket.values()]
    .map((row) => ({
      value: row.value,
      itemCount: row.itemCount,
      sourceCount: row.sourceCount,
      itemIds: [...row.itemIds],
    }))
    .sort(
      (a, b) =>
        b.itemCount - a.itemCount ||
        b.sourceCount - a.sourceCount ||
        a.value.localeCompare(b.value, "zh-CN"),
    );
}

export function buildCategoryInsights(items: CategoryInsightItem[]) {
  const rows = emptyRows();
  let classifiedItems = 0;

  for (const item of items) {
    const valuesByDimension = {
      domain: valuesForDimension(item, "domain"),
      topic: valuesForDimension(item, "topic"),
      entity: valuesForDimension(item, "entity"),
    };
    if (dimensions.some((dimension) => valuesByDimension[dimension].length > 0)) {
      classifiedItems += 1;
    }
    for (const dimension of dimensions) {
      addRows(rows[dimension], valuesByDimension[dimension], item);
    }
  }

  const byDimension = {
    domain: freezeRows(rows.domain),
    topic: freezeRows(rows.topic),
    entity: freezeRows(rows.entity),
  };
  const candidateCount = dimensions.reduce(
    (sum, dimension) =>
      sum + byDimension[dimension].filter((row) => row.itemCount >= 2 && row.sourceCount >= 2).length,
    0,
  );

  return {
    totalItems: items.length,
    classifiedItems,
    unclassifiedItems: Math.max(0, items.length - classifiedItems),
    candidateCount,
    byDimension,
  };
}
