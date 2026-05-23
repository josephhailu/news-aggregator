import { db } from "@news-aggregator/db";
import { articles, packetDigests, sourcePacketMembers, sources } from "@news-aggregator/db/schema";
import { eq } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import { getSourcePacketConfig } from "../adapters/registry";

const PACKET_DISCOVERY_TIMEOUT_MS = 12_000;
const PACKET_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_MEMBER_TEXT_CHARS = 10_000;
const MAX_DIGEST_TEXT_CHARS = 9_000;
const MAX_DIGEST_MEMBERS = 3;
const MAX_MEMBER_EXCERPT_CHARS = 900;
const MIN_PRIMARY_PAGE_CHARS = 600;
const MIN_SUPPORTING_DOC_CHARS = 900;
const PACKET_DIGEST_VERSION = "source-packet-v1";

type PacketMemberKind =
  | "primary_page"
  | "statement"
  | "minutes"
  | "projection"
  | "report"
  | "appendix"
  | "supporting_page";

export type ReadBasis = "primary_page" | "primary_packet" | "wrapper_page" | "summary_only";

export type SourcePacketDigest = {
  articleId: string;
  readBasis: ReadBasis;
  text: string;
  digestVersion: string;
  members: Array<{
    id: string;
    url: string;
    title: string | null;
    memberKind: PacketMemberKind;
    mimeType: string | null;
    priority: number;
    isPrimary: boolean;
    trustedHost: boolean;
    extractionStatus: "ok" | "summary_only";
    excerpt: string;
  }>;
};

type PacketCandidate = {
  url: string;
  title: string | null;
  memberKind: PacketMemberKind;
  priority: number;
  trustedHost: boolean;
  isPrimary: boolean;
  discoveredFromUrl: string | null;
};

type PacketConfig = NonNullable<ReturnType<typeof getSourcePacketConfig>>;
type ExtractedPacketMember = Awaited<ReturnType<typeof extractPacketMember>>;

export async function discoverSourcePacketForArticle(articleId: string) {
  const article = await db
    .select({
      id: articles.id,
      title: articles.title,
      url: articles.url,
      summary: articles.summary,
      sourceName: sources.name,
      adapterKey: sources.adapterKey
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(eq(articles.id, articleId))
    .limit(1);

  const row = article[0];
  if (!row) {
    throw new Error("Article not found");
  }

  const packetConfig = getSourcePacketConfig(row.adapterKey);
  if (!packetConfig || !row.url) {
    return {
      articleId,
      discovered: 0
    };
  }

  const candidates = await discoverPacketCandidates({
    articleUrl: row.url,
      packetConfig
    });

  const primaryCandidate = buildPrimaryCandidate(row.url, row.title);
  const deduped = dedupeCandidates([primaryCandidate, ...candidates]);

  for (const candidate of deduped) {
    await db
      .insert(sourcePacketMembers)
      .values({
        articleId,
        url: candidate.url,
        title: candidate.title,
        memberKind: candidate.memberKind,
        mimeType: null,
        priority: candidate.priority,
        trustedHost: candidate.trustedHost,
        isPrimary: candidate.isPrimary,
        discoveredFromUrl: candidate.discoveredFromUrl,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [sourcePacketMembers.articleId, sourcePacketMembers.url],
        set: {
          title: candidate.title,
          memberKind: candidate.memberKind,
          priority: candidate.priority,
          trustedHost: candidate.trustedHost,
          isPrimary: candidate.isPrimary,
          discoveredFromUrl: candidate.discoveredFromUrl,
          updatedAt: new Date()
        }
      });
  }

  return {
    articleId,
    discovered: deduped.length
  };
}

export async function getSourcePacketDigest(articleId: string): Promise<SourcePacketDigest> {
  const cached = await db.query.packetDigests.findFirst({
    where: (row, { eq }) => eq(row.articleId, articleId)
  });

  if (cached && Date.now() - cached.updatedAt.getTime() < PACKET_CACHE_TTL_MS) {
    return hydrateDigest(articleId, cached);
  }

  const article = await db
    .select({
      id: articles.id,
      title: articles.title,
      url: articles.url,
      summary: articles.summary,
      adapterKey: sources.adapterKey
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(eq(articles.id, articleId))
    .limit(1);

  const row = article[0];
  if (!row) {
    throw new Error("Article not found");
  }

  let members = await db.query.sourcePacketMembers.findMany({
    where: (member, { eq }) => eq(member.articleId, articleId),
    orderBy: (member, { asc }) => [asc(member.priority), asc(member.createdAt)]
  });

  if (members.length === 0) {
    await discoverSourcePacketForArticle(articleId);
    members = await db.query.sourcePacketMembers.findMany({
      where: (member, { eq }) => eq(member.articleId, articleId),
      orderBy: (member, { asc }) => [asc(member.priority), asc(member.createdAt)]
    });
  }

  const extractedMembers: ExtractedPacketMember[] = [];
  for (const member of members) {
    extractedMembers.push(await extractPacketMember(member.id, row.summary));
  }

  const digest = buildPacketDigest({
    articleId,
    articleTitle: row.title,
    articleSummary: row.summary,
    members: extractedMembers
  });

  await db
    .insert(packetDigests)
    .values({
      articleId,
      digestVersion: PACKET_DIGEST_VERSION,
      readBasis: digest.readBasis,
      digest: {
        members: digest.members
      },
      text: digest.text,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: packetDigests.articleId,
      set: {
        digestVersion: PACKET_DIGEST_VERSION,
        readBasis: digest.readBasis,
        digest: {
          members: digest.members
        },
        text: digest.text,
        updatedAt: new Date()
      }
    });

  return digest;
}

async function extractPacketMember(packetMemberId: string, articleSummary: string | null) {
  const member = await db.query.sourcePacketMembers.findFirst({
    where: (row, { eq }) => eq(row.id, packetMemberId)
  });

  if (!member) {
    throw new Error("Packet member not found");
  }

  const cachedOk =
    member.text &&
    member.fetchedAt &&
    Date.now() - member.fetchedAt.getTime() < PACKET_CACHE_TTL_MS &&
    (member.extractionStatus === "ok" || member.extractionStatus === "summary_only");

  if (cachedOk) {
    return {
      ...member,
      text: member.text ?? "",
      extractionStatus: normalizeExtractionStatus(member.extractionStatus)
    };
  }

  const extracted = await extractMemberText(member, articleSummary);

  await db
    .update(sourcePacketMembers)
    .set({
      title: extracted.title,
      mimeType: extracted.mimeType,
      text: extracted.text,
      extractionStatus: extracted.extractionStatus,
      errorMessage: extracted.errorMessage,
      fetchedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(sourcePacketMembers.id, member.id));

  return {
    ...member,
    title: extracted.title,
    mimeType: extracted.mimeType,
    text: extracted.text,
    extractionStatus: extracted.extractionStatus
  };
}

async function extractMemberText(
  member: typeof sourcePacketMembers.$inferSelect,
  articleSummary: string | null
) {
  try {
    const response = await fetch(member.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8",
        "User-Agent": "NewsAggregator/0.1 (+http://localhost:5173)"
      },
      signal: AbortSignal.timeout(PACKET_DISCOVERY_TIMEOUT_MS)
    });

    if (!response.ok) {
      return fromSummary(member, articleSummary, `Request failed with ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/pdf") || member.url.toLowerCase().endsWith(".pdf")) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        const text = sanitizeText(parsed.text);
        if (text.length < MIN_PRIMARY_PAGE_CHARS) {
          return fromSummary(member, articleSummary, "PDF text too thin", contentType);
        }

        return {
          title: member.title,
          mimeType: contentType || "application/pdf",
          text: text.slice(0, MAX_MEMBER_TEXT_CHARS),
          extractionStatus: "ok" as const,
          errorMessage: null
        };
      } finally {
        await parser.destroy();
      }
    }

    if (contentType.includes("text/html") || contentType.includes("xml") || contentType === "") {
      const html = await response.text();
      const text = cleanHtml(html);
      const title = extractHtmlTitle(html) ?? member.title;
      if (text.length < 250) {
        return fromSummary({ ...member, title }, articleSummary, "HTML text too thin", contentType);
      }

      return {
        title,
        mimeType: contentType || "text/html",
        text: text.slice(0, MAX_MEMBER_TEXT_CHARS),
        extractionStatus: text.length >= MIN_PRIMARY_PAGE_CHARS ? ("ok" as const) : ("summary_only" as const),
        errorMessage: null
      };
    }

    return fromSummary(member, articleSummary, `Unsupported content type: ${contentType}`, contentType);
  } catch (error) {
    return fromSummary(
      member,
      articleSummary,
      error instanceof Error ? error.message : "Unknown extraction error"
    );
  }
}

function fromSummary(
  member: Pick<typeof sourcePacketMembers.$inferSelect, "title" | "url">,
  summary: string | null,
  errorMessage: string,
  mimeType: string | null = null
) {
  return {
    title: member.title,
    mimeType,
    text: [member.title, summary].filter(Boolean).join("\n\n").slice(0, MAX_MEMBER_TEXT_CHARS),
    extractionStatus: "summary_only" as const,
    errorMessage
  };
}

function buildPacketDigest(input: {
  articleId: string;
  articleTitle: string;
  articleSummary: string | null;
  members: Array<{
    id: string;
    url: string;
    title: string | null;
    memberKind: string;
    mimeType: string | null;
    priority: number;
    isPrimary: boolean;
    trustedHost: boolean;
    extractionStatus: string;
    text: string | null;
  }>;
}): SourcePacketDigest {
  const normalizedMembers = input.members.map(normalizeExtractedMember).sort(compareMemberPriority);
  const primaryMember = normalizedMembers.find((member) => member.isPrimary);
  const substantiveSupportingDocs = normalizedMembers.filter(
    (member) => !member.isPrimary && member.text.length >= MIN_SUPPORTING_DOC_CHARS
  );

  let readBasis: ReadBasis = "summary_only";
  if (substantiveSupportingDocs.length > 0) {
    readBasis = "primary_packet";
  } else if (primaryMember && primaryMember.text.length >= MIN_PRIMARY_PAGE_CHARS) {
    readBasis = "primary_page";
  } else if (primaryMember && primaryMember.text.length > 0) {
    readBasis = "wrapper_page";
  }

  const membersForDigest =
    readBasis === "primary_packet"
      ? normalizedMembers.filter(
          (member) =>
            member.isPrimary ||
            member.text.length >= MIN_SUPPORTING_DOC_CHARS ||
            member.memberKind === "statement"
        )
      : normalizedMembers.filter((member) => member.isPrimary).slice(0, 1);

  const digestMembers = membersForDigest.slice(0, MAX_DIGEST_MEMBERS).map((member) => ({
    id: member.id,
    url: member.url,
    title: member.title,
    memberKind: member.memberKind as PacketMemberKind,
    mimeType: member.mimeType,
    priority: member.priority,
    isPrimary: member.isPrimary,
    trustedHost: member.trustedHost,
    extractionStatus: member.extractionStatus,
    excerpt: member.text.slice(0, MAX_MEMBER_EXCERPT_CHARS)
  }));

  let text = digestMembers
    .map((member) => {
      const heading = `${member.isPrimary ? "Primary page" : "Supporting document"}: ${
        member.title ?? member.url
      } (${member.memberKind})`;
      return `${heading}\n${member.excerpt}`;
    })
    .join("\n\n");

  if (!text.trim()) {
    text = [input.articleTitle, input.articleSummary].filter(Boolean).join("\n\n");
  }

  return {
    articleId: input.articleId,
    readBasis,
    text: text.slice(0, MAX_DIGEST_TEXT_CHARS),
    digestVersion: PACKET_DIGEST_VERSION,
    members: digestMembers
  };
}

function normalizeExtractedMember(
  member: {
    id: string;
    url: string;
    title: string | null;
    memberKind: string;
    mimeType: string | null;
    priority: number;
    isPrimary: boolean;
    trustedHost: boolean;
    extractionStatus: string;
    text: string | null;
  } & Record<string, unknown>
) {
  return {
    ...member,
    memberKind: normalizeMemberKind(member.memberKind),
    extractionStatus: normalizeExtractionStatus(member.extractionStatus),
    text: sanitizeText(member.text ?? "")
  };
}

function compareMemberPriority(
  left: ReturnType<typeof normalizeExtractedMember>,
  right: ReturnType<typeof normalizeExtractedMember>
) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  if (left.isPrimary !== right.isPrimary) {
    return left.isPrimary ? -1 : 1;
  }

  return left.url.localeCompare(right.url);
}

async function discoverPacketCandidates(input: {
  articleUrl: string;
  packetConfig: PacketConfig;
}): Promise<PacketCandidate[]> {
  const response = await fetch(input.articleUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "NewsAggregator/0.1 (+http://localhost:5173)"
    },
    signal: AbortSignal.timeout(PACKET_DISCOVERY_TIMEOUT_MS)
  }).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("xml")) {
    return [];
  }

  const html = await response.text();
  const anchors = extractAnchors(html, input.articleUrl);

  return anchors
    .filter((anchor) => anchor.url !== canonicalizeUrl(input.articleUrl))
    .map((anchor) => classifyPacketCandidate(anchor, input.articleUrl, input.packetConfig))
    .filter((candidate): candidate is PacketCandidate => candidate !== null);
}

function classifyPacketCandidate(
  anchor: { url: string; label: string },
  articleUrl: string,
  packetConfig: PacketConfig
): PacketCandidate | null {
  const url = new URL(anchor.url);
  const trustedHost = packetConfig.allowedHosts.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  );
  if (!trustedHost) {
    return null;
  }

  const haystack = `${anchor.label} ${url.pathname}`.toLowerCase();
  let memberKind: PacketMemberKind | null = null;
  let priority = 100;

  for (const rule of packetConfig.linkRules) {
    if (rule.pattern.test(haystack)) {
      memberKind = rule.memberKind;
      priority = rule.priority;
      break;
    }
  }

  if (!memberKind) {
    if (url.pathname.toLowerCase().endsWith(".pdf")) {
      memberKind = "report";
      priority = 50;
    } else {
      return null;
    }
  }

  return {
    url: canonicalizeUrl(anchor.url),
    title: anchor.label || null,
    memberKind,
    priority,
    trustedHost,
    isPrimary: false,
    discoveredFromUrl: articleUrl
  };
}

function extractAnchors(html: string, baseUrl: string) {
  const anchors: Array<{ url: string; label: string }> = [];
  const anchorPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[2];
    if (!href) {
      continue;
    }

    const label = sanitizeText((match[3] ?? "").replace(/<[^>]+>/g, " "));

    try {
      const resolved = new URL(href, baseUrl);
      anchors.push({
        url: resolved.toString(),
        label
      });
    } catch {
      continue;
    }
  }

  return anchors;
}

function buildPrimaryCandidate(url: string, title: string): PacketCandidate {
  return {
    url: canonicalizeUrl(url),
    title,
    memberKind: "primary_page",
    priority: 0,
    trustedHost: true,
    isPrimary: true,
    discoveredFromUrl: null
  };
}

function dedupeCandidates(candidates: PacketCandidate[]) {
  const seen = new Map<string, PacketCandidate>();

  for (const candidate of candidates) {
    const existing = seen.get(candidate.url);
    if (!existing || candidate.priority < existing.priority) {
      seen.set(candidate.url, candidate);
    }
  }

  return [...seen.values()].sort((left, right) => left.priority - right.priority);
}

function hydrateDigest(
  articleId: string,
  digestRow: typeof packetDigests.$inferSelect
): SourcePacketDigest {
  const raw = digestRow.digest as { members?: SourcePacketDigest["members"] };
  return {
    articleId,
    readBasis: normalizeReadBasis(digestRow.readBasis),
    text: digestRow.text,
    digestVersion: digestRow.digestVersion,
    members: Array.isArray(raw.members) ? raw.members : []
  };
}

function normalizeReadBasis(value: string): ReadBasis {
  if (
    value === "primary_page" ||
    value === "primary_packet" ||
    value === "wrapper_page" ||
    value === "summary_only"
  ) {
    return value;
  }

  return "summary_only";
}

function normalizeMemberKind(value: string): PacketMemberKind {
  switch (value) {
    case "statement":
    case "minutes":
    case "projection":
    case "report":
    case "appendix":
    case "supporting_page":
    case "primary_page":
      return value;
    default:
      return "supporting_page";
  }
}

function normalizeExtractionStatus(value: string): "ok" | "summary_only" {
  return value === "ok" ? "ok" : "summary_only";
}

function extractHtmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? sanitizeText(match[1]) : null;
}

function cleanHtml(html: string) {
  return sanitizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function sanitizeText(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
