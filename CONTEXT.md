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
- An **Admin User** may use operational controls such as source ingestion and model evaluation.

## Example Dialogue

> **Dev:** "Should the Bank of Canada source use the Hacker News score formula?"
> **Domain expert:** "No, it is an **Official Policy Source**, so **Source-Aware Ranking** should treat freshness and policy relevance as the main signals."

## Flagged Ambiguities

- "AI insight" is too broad today. Use **Fed Macro Read** for the current feature until a second real insight type exists.
