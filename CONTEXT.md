# News Aggregator Context

This context names the source and ranking concepts that shape News Aggregator. It exists so architecture discussions keep product language stable as new sources are added.

## Language

**Source**:
An origin that publishes or surfaces articles for ingestion.
_Avoid_: Provider, feed provider

**Engagement Source**:
A **Source** where article relevance is primarily inferred from audience activity such as points, comments, votes, or rank.
_Avoid_: Social source, community feed

**Official Policy Source**:
A **Source** where article relevance is primarily inferred from institutional authority, topic fit, and freshness rather than audience engagement.
_Avoid_: Government feed, official feed

**Source-Aware Ranking**:
Ranking that interprets each **Source** using signals appropriate to that source instead of forcing all articles through one global score model.
_Avoid_: Universal ranking, generic ranking

**Ranked Feed Snapshot**:
A persisted ordering of articles for a feed window at a point in time.
_Avoid_: Feed cache, ranked list

**Fed Macro Read**:
An in-house AI explanation of a Federal Reserve monetary policy release for macro and market-learning context.
_Avoid_: AI summary, Fed insight

**Central Bank Policy Release**:
A monetary policy article published by a central bank, such as the Federal Reserve or Bank of Canada.
_Avoid_: Rate article, bank post

**Source Packet**:
The full set of materials the app should read for one article, consisting of the primary article page plus any directly linked supporting documents that are essential to understanding it.
_Avoid_: Supporting literature, supporting articles, doc bundle

**Direct Article Access**:
The article page can be fetched directly by the app and turned into enough text for an in-house AI read.
_Avoid_: Scrapeable, readable

**Read Basis**:
The level of primary-source substance available for a **Policy Macro Read**, based on whether the read comes from a substantive primary page, a richer **Source Packet**, a thin wrapper page, or only a summary fallback.
_Avoid_: Weak read, strong read, doc count quality

**Packet Digest**:
A structured, model-ready representation of a **Source Packet** that preserves document provenance while selecting the most relevant sections from each packet member.
_Avoid_: Raw packet dump, merged blob, full text prompt

**Policy Macro Read**:
An in-house AI explanation of a directly accessible **Central Bank Policy Release** for macro and market-learning context.
_Avoid_: AI summary, generic insight

**Policy Read Model Run**:
One successful or failed attempt to produce a **Policy Macro Read** from a specific source input using a specific model and prompt contract.
_Avoid_: Model call, AI request

**Model Candidate**:
A selectable model configuration for producing a **Policy Macro Read**, including the runtime, model identifier, and generation settings.
_Avoid_: Model name, provider

**Model Run Metrics**:
Observed facts about a **Policy Read Model Run** that help compare operational behavior.
_Avoid_: Model performance, telemetry

**Model Quality Review**:
A human or rubric-based judgment of whether a **Policy Macro Read** is useful, grounded, and clear enough for the reader.
_Avoid_: Accuracy score, vibes check

**Policy Read Model Evaluation**:
A comparison of **Model Candidates** for the **Policy Macro Read** use case using **Model Run Metrics** and optional **Model Quality Review**.
_Avoid_: Benchmark, leaderboard

**Admin User**:
A signed-in user trusted to manage source ingestion, model evaluation, and other operational controls.
_Avoid_: Operator, superuser

## Relationships

- A **Source** is either an **Engagement Source**, an **Official Policy Source**, or a future source type not yet named.
- **Hacker News** is an **Engagement Source**.
- **Federal Reserve Monetary Policy** is an **Official Policy Source**.
- **Bank of Canada Monetary Policy** is an **Official Policy Source**.
- A **Central Bank Policy Release** belongs to exactly one **Official Policy Source**.
- A **Central Bank Policy Release** may resolve to one **Source Packet**.
- A **Source Packet** can be transformed into one **Packet Digest**.
- **Source-Aware Ranking** produces a **Ranked Feed Snapshot**.
- A **Policy Macro Read** should disclose its **Read Basis**.
- A **Central Bank Policy Release** with **Direct Article Access** can receive a **Policy Macro Read**.
- A **Fed Macro Read** is the first **Policy Macro Read** implementation.
- A **Policy Macro Read** may be produced by one or more **Policy Read Model Runs**.
- A **Policy Read Model Run** uses exactly one **Model Candidate**.
- A **Policy Read Model Run** may have one **Model Run Metrics** record.
- A failed **Policy Read Model Run** still contributes to **Policy Read Model Evaluation**.
- A **Policy Read Model Run** may receive one or more **Model Quality Reviews**.
- A **Policy Read Model Evaluation** compares **Model Candidates** for the same read purpose.
- An **Admin User** may use operational controls such as source ingestion and model evaluation.

## Example Dialogue

> **Dev:** "Should the Bank of Canada source use the Hacker News score formula?"
> **Domain expert:** "No, it is an **Official Policy Source**, so **Source-Aware Ranking** should treat freshness and policy relevance as the main signals."

## Flagged Ambiguities

- "AI insight" is too broad today. Use **Fed Macro Read** for the current feature until a second real insight type exists.
- "model performance" is too broad. Use **Model Run Metrics** for operational measurements and **Model Quality Review** for answer-quality judgments.
