# ADR 0001: Source Packet-Based Policy Macro Reads

- Status: Accepted
- Date: 2026-05-23

## Context

The original policy read pipeline treated the article landing page as the sole read target:

`Central Bank Policy Release -> article page text -> Policy Macro Read`

That model fails for official policy sources when the landing page is only a wrapper around the real source material, such as linked PDFs, statements, minutes, projections, or reports. In practice this caused the in-house AI to summarize summaries, which made downstream interpretation shallow and unreliable.

The project context now distinguishes:

- **Source Packet**: the primary article page plus any directly linked supporting documents that are essential to understanding it
- **Read Basis**: whether a read is grounded in a substantive primary page, a richer packet, a thin wrapper page, or only a summary fallback
- **Packet Digest**: a structured, model-ready representation of a packet that preserves provenance while trimming noise

## Decision

For **Official Policy Sources**, **Policy Macro Reads** will use a **Source Packet** pipeline instead of a single-page extraction pipeline.

The default behavior is:

1. Discover packet members at ingestion time
2. Limit discovery to one hop from the article page
3. Only include links on allowlisted authoritative hosts for that source
4. Prefer substantive supporting documents over landing-page summaries when building the read input
5. Persist packet members explicitly in the database
6. Extract packet-member text and assemble a **Packet Digest** on demand
7. Generate the **Policy Macro Read** from the digest, not from a raw page blob
8. Disclose **Read Basis** in the resulting read

## Boundaries

### Discovery

- One hop only from the primary article page
- No recursive crawling
- No third-party links unless a source adapter explicitly trusts them

### Source-specific behavior

The packet pipeline uses a hybrid model:

- generic discovery, extraction, and digest machinery
- source-specific packet rules in adapters for:
  - trusted hosts
  - link patterns
  - document priority hints

### Fallbacks

If no strong supporting document is found, the app may still generate a read from the primary page or summary fallback. The important distinction is not “did we find attachments?” but “how substantive was the primary-source material?” That distinction is captured in **Read Basis**.

## Consequences

### Positive

- Avoids summarizing wrapper pages when richer primary-source material exists
- Makes discovery and provenance inspectable instead of opaque
- Keeps ingestion bounded while preserving important link structure
- Supports future PDF and document-heavy policy sources without rewriting the read contract

### Costs

- Adds database structure and more moving parts
- Requires source-specific packet rules to stay reliable
- Makes extraction quality, especially for PDFs, more important

## Implementation Notes

The first implementation slice adds:

- `source_packet_members`
- `packet_digests`
- ingestion-time packet discovery for policy sources
- on-demand packet extraction and digest assembly
- **Policy Macro Read** generation from packet digests

This ADR does not authorize broad crawling, user-submitted URL packet discovery, or multi-hop source exploration.
