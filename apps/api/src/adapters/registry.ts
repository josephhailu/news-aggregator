import { bankOfCanadaAdapter } from "./bank-of-canada";
import { federalReserveAdapter } from "./federal-reserve";
import { hackerNewsAdapter } from "./hacker-news";
import type { ArticleReadType, SourceAdapter, SourceKind } from "./types";

export const sourceAdapters = [hackerNewsAdapter, federalReserveAdapter, bankOfCanadaAdapter] as const;

const sourceMetadataByKey = new Map(
  sourceAdapters.map((adapter) => [
    adapter.key,
    {
      sourceKind: adapter.sourceKind,
      availableReads: adapter.availableReads ?? []
    }
  ])
);

export function getSourceMetadata(adapterKey: string): {
  sourceKind: SourceKind;
  availableReads: ArticleReadType[];
} {
  return (
    sourceMetadataByKey.get(adapterKey) ?? {
      sourceKind: "official_policy",
      availableReads: []
    }
  );
}

export function getSourceAdapter(adapterKey: string): SourceAdapter | null {
  return sourceAdapters.find((adapter) => adapter.key === adapterKey) ?? null;
}
