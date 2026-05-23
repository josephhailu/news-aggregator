export type SourceKind = "engagement" | "official_policy";

export type ArticleReadType = "policy_macro";
export type PacketMemberKind =
  | "primary_page"
  | "statement"
  | "minutes"
  | "projection"
  | "report"
  | "appendix"
  | "supporting_page";

export type SourcePacketRule = {
  pattern: RegExp;
  memberKind: PacketMemberKind;
  priority: number;
};

export type SourcePacketConfig = {
  allowedHosts: string[];
  linkRules: SourcePacketRule[];
};

export type SourceArticleInput = {
  externalId: string;
  title: string;
  url: string | null;
  discussionUrl: string | null;
  author: string | null;
  summary?: string | null;
  publishedAt: Date;
  raw: Record<string, unknown>;
  signals: {
    points?: number | null;
    comments?: number | null;
    views?: number | null;
    stars?: number | null;
    sourceRank?: number | null;
    rawSignals: Record<string, unknown>;
  };
};

export type SourceAdapter = {
  key: string;
  name: string;
  slug: string;
  homepageUrl: string;
  sourceKind: SourceKind;
  availableReads?: ArticleReadType[];
  sourcePacketConfig?: SourcePacketConfig;
  fetchTopArticles(): Promise<SourceArticleInput[]>;
};
