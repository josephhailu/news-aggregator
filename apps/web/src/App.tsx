import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  BrainCircuit,
  ChevronDown,
  Clock3,
  ExternalLink,
  Flame,
  Loader2,
  LogOut,
  RefreshCw,
  Sparkles,
  UserRound
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { authClient, useSession } from "./auth-client";
import {
  FeedItem,
  FeedKey,
  PolicyMacroRead,
  generatePolicyMacroRead,
  getCachedPolicyMacroRead,
  getFeed,
  ingestBankOfCanada,
  ingestAllSources,
  ingestFederalReserve,
  ingestHackerNews,
  setBookmark
} from "./api";

const feedTabs: Array<{ key: FeedKey; label: string; icon: typeof Flame }> = [
  { key: "top-now", label: "Top Now", icon: Flame },
  { key: "today", label: "Today", icon: Clock3 },
  { key: "week", label: "Week", icon: Sparkles },
  { key: "latest", label: "Latest", icon: RefreshCw }
];

export function App() {
  const [activeFeed, setActiveFeed] = useState<FeedKey>("top-now");
  const queryClient = useQueryClient();
  const session = useSession();
  const user = session.data?.user;
  const isAdmin = user?.role === "admin";

  const feedQuery = useQuery({
    queryKey: ["feed", activeFeed, user?.id],
    queryFn: () => getFeed(activeFeed)
  });

  const ingestAllMutation = useMutation({
    mutationFn: ingestAllSources,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    }
  });

  const ingestHnMutation = useMutation({
    mutationFn: ingestHackerNews,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    }
  });

  const ingestFedMutation = useMutation({
    mutationFn: ingestFederalReserve,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    }
  });

  const ingestBocMutation = useMutation({
    mutationFn: ingestBankOfCanada,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    }
  });

  const bookmarkMutation = useMutation({
    mutationFn: ({ articleId, bookmarked }: { articleId: string; bookmarked: boolean }) =>
      setBookmark(articleId, bookmarked),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    }
  });

  const updatedAt = useMemo(() => {
    const first = feedQuery.data?.items[0];
    return first ? new Date(first.computedAt).toLocaleTimeString([], { timeStyle: "short" }) : null;
  }, [feedQuery.data]);
  const ingestError =
    ingestAllMutation.error ??
    ingestHnMutation.error ??
    ingestFedMutation.error ??
    ingestBocMutation.error;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-ink/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-river">
              Source-aware ranking
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">News Aggregator</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
              Top Now takes the 10 newest items from each source, merges them, then sorts by
              published date. Hacker News, Federal Reserve, and Bank of Canada monetary policy
              releases are live; the schema is ready for RSS, Reddit, and future user submissions.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {updatedAt ? <p className="text-sm text-ink/60">Ranked at {updatedAt}</p> : null}
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={ingestAllMutation.isPending}
                  onClick={() => ingestAllMutation.mutate()}
                >
                  {ingestAllMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh all
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={ingestHnMutation.isPending}
                  onClick={() => ingestHnMutation.mutate()}
                >
                  HN
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={ingestFedMutation.isPending}
                  onClick={() => ingestFedMutation.mutate()}
                >
                  Fed Policy
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={ingestBocMutation.isPending}
                  onClick={() => ingestBocMutation.mutate()}
                >
                  BoC Policy
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <aside className="space-y-4 lg:col-start-2">
            <AuthPanel />
            <div className="rounded-lg border border-ink/10 bg-white/70 p-4 shadow-soft">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-river">
                Ranking V1
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/60">Top Now</dt>
                  <dd className="font-medium">10 per source</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/60">Today</dt>
                  <dd className="font-medium">24h score</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/60">Week</dt>
                  <dd className="font-medium">7d score</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/60">Signals</dt>
                  <dd className="font-medium">newest first</dd>
                </div>
              </dl>
            </div>
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="mb-4 flex gap-2 overflow-x-auto border-b border-ink/10">
              {feedTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeFeed === tab.key;
                return (
                  <button
                    className={`inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${
                      active
                        ? "border-coral text-ink"
                        : "border-transparent text-ink/55 hover:text-ink"
                    }`}
                    key={tab.key}
                    onClick={() => setActiveFeed(tab.key)}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {feedQuery.isLoading ? <LoadingList /> : null}
            {feedQuery.isError ? (
              <EmptyState
                title="No feed yet"
                message="Start Postgres, run migrations, then refresh sources to populate the first ranked snapshot."
              />
            ) : null}
            {feedQuery.data?.items.length === 0 ? (
              <EmptyState
                title="Waiting for articles"
                message={
                  isAdmin
                    ? "Use Refresh all after the API and database are running. The first import pulls Hacker News plus Federal Reserve and Bank of Canada monetary policy releases."
                    : "An admin user can refresh sources after the API and database are running. Once populated, the feed is readable here."
                }
              />
            ) : null}
            {ingestError ? (
              <EmptyState
                title="Refresh failed"
                message={
                  ingestError instanceof Error
                    ? ingestError.message
                    : "The API denied or failed the refresh request."
                }
              />
            ) : null}

            <div className="grid gap-3">
              {feedQuery.data?.items.map((item) => (
                <ArticleRow
                  item={item}
                  key={item.articleId}
                  canBookmark={Boolean(user)}
                  onBookmark={(bookmarked) =>
                    bookmarkMutation.mutate({ articleId: item.articleId, bookmarked })
                  }
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ArticleRow({
  item,
  canBookmark,
  onBookmark
}: {
  item: FeedItem;
  canBookmark: boolean;
  onBookmark: (bookmarked: boolean) => void;
}) {
  const destination = item.url ?? item.discussionUrl ?? "#";
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const hoverTimer = useRef<number | null>(null);
  const hasPolicyMacroRead = item.availableReads.includes("policy_macro");

  function prefetchCachedInsight() {
    if (!hasPolicyMacroRead) {
      return;
    }

    hoverTimer.current = window.setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["policy-macro-read", item.articleId],
        queryFn: () => getCachedPolicyMacroRead(item.articleId),
        staleTime: 1000 * 60 * 10
      });
    }, 650);
  }

  function cancelPrefetch() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  return (
    <article
      className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm"
      onMouseEnter={prefetchCachedInsight}
      onMouseLeave={cancelPrefetch}
    >
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-citrus text-sm font-bold">
          {item.position}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink/55">
            <span>{item.sourceName}</span>
            <span>{new Date(item.publishedAt).toLocaleString([], { dateStyle: "medium" })}</span>
            {item.author ? <span>by {item.author}</span> : null}
          </div>
          <a
            className="mt-1 inline-flex max-w-full items-start gap-2 text-lg font-semibold leading-6 text-ink hover:text-river"
            href={destination}
          >
            <span>{item.title}</span>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0" />
          </a>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink/60">
            <span>{Math.round(item.score)} score</span>
            {item.points !== null ? <span>{item.points} points</span> : null}
            {item.comments !== null ? <span>{item.comments} comments</span> : null}
            <button
              className="inline-flex items-center gap-1 font-medium text-river hover:underline"
              onClick={() => setExpanded((value) => !value)}
            >
              {hasPolicyMacroRead ? <BrainCircuit className="h-4 w-4" /> : null}
              {hasPolicyMacroRead ? "AI read" : "Summary"}
              <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
            {item.discussionUrl ? (
              <a className="font-medium text-river hover:underline" href={item.discussionUrl}>
                discussion
              </a>
            ) : null}
          </div>
        </div>
        <button
          className={`h-10 w-10 rounded-md border transition ${
            item.bookmarked
              ? "border-coral bg-coral text-white"
              : "border-ink/10 bg-white text-ink/60 hover:text-ink"
          } disabled:cursor-not-allowed disabled:opacity-40`}
          disabled={!canBookmark}
          onClick={() => onBookmark(!item.bookmarked)}
          title={canBookmark ? "Bookmark" : "Sign in to bookmark"}
        >
          <Bookmark className="mx-auto h-4 w-4" fill={item.bookmarked ? "currentColor" : "none"} />
        </button>
      </div>
      {expanded ? (
        hasPolicyMacroRead ? (
          <PolicyMacroReadPanel articleId={item.articleId} fallbackSummary={item.summary} />
        ) : (
          <ArticleSummaryPanel item={item} />
        )
      ) : null}
    </article>
  );
}

function ArticleSummaryPanel({ item }: { item: FeedItem }) {
  return (
    <div className="mt-4 border-t border-ink/10 pt-4">
      <div className="rounded-md bg-ink/[0.03] p-4">
        <h3 className="text-sm font-semibold">Source summary</h3>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          {item.summary ??
            "No source summary is available yet. This row is still expandable so richer summaries can be added source by source."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-ink/55">
          <span>{item.sourceName}</span>
          {item.points !== null ? <span>{item.points} points</span> : null}
          {item.comments !== null ? <span>{item.comments} comments</span> : null}
          {item.sourceRank !== null ? <span>source rank {item.sourceRank}</span> : null}
        </div>
      </div>
    </div>
  );
}

function PolicyMacroReadPanel({
  articleId,
  fallbackSummary
}: {
  articleId: string;
  fallbackSummary: string | null;
}) {
  const cachedInsightQuery = useQuery({
    queryKey: ["policy-macro-read", articleId],
    queryFn: () => getCachedPolicyMacroRead(articleId),
    staleTime: 1000 * 60 * 10
  });

  const insightMutation = useMutation({
    mutationFn: (force: boolean) => generatePolicyMacroRead(articleId, force),
    onSuccess: (data) => {
      cachedInsightQuery.refetch();
      return data;
    }
  });

  const cachedInsight =
    cachedInsightQuery.data?.status === "ready" ? cachedInsightQuery.data.insight : null;
  const insight = insightMutation.data?.insight ?? cachedInsight;

  return (
    <div className="mt-4 border-t border-ink/10 pt-4">
      <div className="mb-3 rounded-md bg-ink/[0.03] p-4">
        <h3 className="text-sm font-semibold">Source summary</h3>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          {fallbackSummary ??
            "This policy item has no source summary, so the local AI read will fetch and summarize the article page when generated."}
        </p>
      </div>

      {cachedInsightQuery.isLoading ? (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-ink/[0.03] p-4 text-sm text-ink/65">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking cached AI read...
        </div>
      ) : null}

      {!insight && !insightMutation.isPending && !cachedInsightQuery.isLoading ? (
        <div className="flex flex-col gap-3 rounded-md bg-ink/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Policy macro read</h3>
            <p className="mt-1 text-sm leading-6 text-ink/65">
              Generate and cache an in-house AI explanation of the policy signal and possible
              second-order market effects.
            </p>
          </div>
          <button
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-river px-4 text-sm font-semibold text-white transition hover:bg-river/90"
            onClick={() => insightMutation.mutate(false)}
          >
            <BrainCircuit className="h-4 w-4" />
            Analyze
          </button>
        </div>
      ) : null}

      {insightMutation.isPending ? (
        <div className="flex items-center gap-2 rounded-md bg-ink/[0.03] p-4 text-sm text-ink/65">
          <Loader2 className="h-4 w-4 animate-spin" />
          Asking the local model to read the release...
        </div>
      ) : null}

      {insightMutation.isError ? (
        <div className="rounded-md border border-coral/30 bg-coral/10 p-4 text-sm leading-6 text-ink/75">
          <p className="font-semibold">Local AI is not ready yet.</p>
          <p className="mt-1">
            {insightMutation.error instanceof Error
              ? insightMutation.error.message
              : "Start Ollama, pull the configured model, then try again."}
          </p>
        </div>
      ) : null}

      {insight ? (
        <PolicyMacroReadResult insight={insight} onRegenerate={() => insightMutation.mutate(true)} />
      ) : null}
    </div>
  );
}

function PolicyMacroReadResult({
  insight,
  onRegenerate
}: {
  insight: PolicyMacroRead;
  onRegenerate: () => void;
}) {
  const hasWhyItMatters = insight.whyItMatters.length > 0;
  const hasSecondOrderEffects = insight.secondOrderEffects.length > 0;
  const hasWatchNext = insight.watchNext.length > 0;

  return (
    <div className="rounded-md border border-river/20 bg-river/[0.04] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {insight.policySignal ? (
              <span className="rounded bg-river px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {formatSignal(insight.policySignal)}
              </span>
            ) : (
              <span className="rounded bg-ink/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink/65">
                no strong policy signal
              </span>
            )}
            <span className="text-xs font-medium text-ink/55">
              {insight.confidence} confidence
            </span>
            {insight.cached ? <span className="text-xs text-ink/45">cached</span> : null}
            <span className="text-xs text-ink/45">{formatReadBasis(insight.readBasis)}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink/80">{insight.plainEnglishSummary}</p>
        </div>
        <button
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-white px-3 text-sm font-semibold hover:bg-ink/5"
          onClick={onRegenerate}
        >
          Regenerate
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {hasWhyItMatters ? <InsightList title="Why It Matters" items={insight.whyItMatters} /> : null}
        {hasSecondOrderEffects ? (
          <InsightList title="Second-Order Effects" items={insight.secondOrderEffects} />
        ) : null}
        {hasWatchNext ? <InsightList title="Watch Next" items={insight.watchNext} /> : null}
        <InsightList title="Caveats" items={insight.caveats} />
      </div>

      {!hasSecondOrderEffects ? (
        <p className="mt-4 text-sm leading-6 text-ink/65">
          No strong second-order effects were inferred from this release alone.
        </p>
      ) : null}

      <p className="mt-4 text-xs text-ink/45">
        Generated by {insight.modelId} with prompt {insight.promptVersion}. Not financial advice.
      </p>
    </div>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-river">{title}</h4>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-ink/75">
        {items.map((item, index) => (
          <li className="flex gap-2" key={`${title}-${index}`}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatSignal(signal: NonNullable<PolicyMacroRead["policySignal"]>) {
  return signal.replace("_", " ");
}

function formatReadBasis(readBasis: PolicyMacroRead["readBasis"]) {
  switch (readBasis) {
    case "primary_packet":
      return "based on primary source packet";
    case "primary_page":
      return "based on substantive primary page";
    case "wrapper_page":
      return "based on wrapper page only";
    case "summary_only":
    default:
      return "based on summary fallback";
  }
}

function AuthPanel() {
  const session = useSession();
  const user = session.data?.user;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

    setPending(false);
    if (result.error) {
      setMessage(result.error.message ?? "Authentication failed");
      return;
    }

    setMessage(mode === "signup" ? "Account created." : "Signed in.");
    window.location.reload();
  }

  if (user) {
    return (
      <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-river text-white">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-ink/60">{user.email}</p>
          </div>
        </div>
        <button
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-ink/10 text-sm font-semibold transition hover:bg-ink/5"
          onClick={async () => {
            await authClient.signOut();
            window.location.reload();
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="mb-4 grid grid-cols-2 rounded-md bg-ink/5 p-1">
        {(["signin", "signup"] as const).map((value) => (
          <button
            className={`h-9 rounded text-sm font-semibold ${
              mode === value ? "bg-white shadow-sm" : "text-ink/60"
            }`}
            key={value}
            onClick={() => setMode(value)}
          >
            {value === "signin" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <form className="space-y-3" onSubmit={submit}>
        {mode === "signup" ? (
          <label className="block text-sm font-medium">
            Name
            <input
              className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3 outline-none focus:border-river"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3 outline-none focus:border-river"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3 outline-none focus:border-river"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {message ? <p className="text-sm text-ink/65">{message}</p> : null}
        <button
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-river text-sm font-semibold text-white transition hover:bg-river/90 disabled:opacity-60"
          disabled={pending}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white/65 p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/65">{message}</p>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="h-28 animate-pulse rounded-lg bg-white/80" key={index} />
      ))}
    </div>
  );
}
