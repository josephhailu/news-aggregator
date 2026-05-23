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

**Direct Article Access**:
The article page can be fetched directly by the app and turned into enough text for an in-house AI read.
_Avoid_: Scrapeable, readable

**Policy Macro Read**:
An in-house AI explanation of a directly accessible **Central Bank Policy Release** for macro and market-learning context.
_Avoid_: AI summary, generic insight

## Relationships

- A **Source** is either an **Engagement Source**, an **Official Policy Source**, or a future source type not yet named.
- **Hacker News** is an **Engagement Source**.
- **Federal Reserve Monetary Policy** is an **Official Policy Source**.
- **Bank of Canada Monetary Policy** is an **Official Policy Source**.
- A **Central Bank Policy Release** belongs to exactly one **Official Policy Source**.
- **Source-Aware Ranking** produces a **Ranked Feed Snapshot**.
- A **Central Bank Policy Release** with **Direct Article Access** can receive a **Policy Macro Read**.
- A **Fed Macro Read** is the first **Policy Macro Read** implementation.

## Example Dialogue

> **Dev:** "Should the Bank of Canada source use the Hacker News score formula?"
> **Domain expert:** "No, it is an **Official Policy Source**, so **Source-Aware Ranking** should treat freshness and policy relevance as the main signals."

## Flagged Ambiguities

- "AI insight" is too broad today. Use **Fed Macro Read** for the current feature until a second real insight type exists.
