# Deckd model benchmark research — 2026-08-08

Sources: SWE-bench (swebench.com, mini-swe-agent 2.0.0), Vellum LLM Leaderboard,
llm-stats.com "Best AI for Coding", LiveBench (livebench.ai), WebDev Arena
(arena.ai/leaderboard/code/webdev), awesome-llm-bench (benchlm.ai). All figures
are as retrieved 2026-08-08. "OURS" = models on Josh's approved route table.

## Frontier results (all models)

| Benchmark | #1 | #2 | #3 |
|---|---|---|---|
| SWE-bench Verified (mini-swe-agent) | Claude 4.5 Opus 76.8% | Gemini 3 Flash 75.8% / MiniMax M2.5 75.8% | Claude Opus 4.6 75.6% |
| Agentic coding (Vellum) | GPT-5.6 Sol 96.2% | Claude Mythos 5 95.5% | Claude Fable 5 95.0% |
| WebDev Arena (frontend, human pref) | Kimi K3 1675 | Claude Fable 5 1631 | GPT-5.6 Sol 1620 |
| Terminal-Bench 2.1 | GPT-5.6 Sol 88.8 | Kimi K3 88.3 | Claude Mythos 5 88.0 |
| LiveBench overall | Gemini 3.1 Pro Preview 77.0 | Muse Spark 1.1 75.3 | Gemini 3.5 Flash / GPT-5.2 74.6 |
| LiveBench coding | GLM-5.2 79.7 | Gemini 3.5 Flash 78.2 | Gemini 3.6 Flash 77.9 |
| LiveCodeBench | DeepSeek V4 Pro Max 93.5% | Qwen3.7 Max / DeepSeek V4 Flash Max 91.6% | Kimi K2.6 89.6% |

## Our stack, ranked per task

**Complex/agentic coding (builds, refactors, multi-file):**
1. Sol (gpt-5.6-sol) — 96.2% agentic coding, 88.8 terminal
2. Luna (gpt-5.6-luna) — 93% agentic coding, 84.3 terminal, $0.40/M (best value top tier)
3. Kimi K3 — 88.3 terminal, WebDev #2

**Frontend / UI / visual work:**
1. Kimi K3 — WebDev Arena 1675, beats Sol (1620)
2. Sol — 1620
3. Luna — 1523

**Pure code generation (LiveBench coding):**
1. GLM-5.2 — 79.7 (tops GPT-5.2 High's 76.1; best open model)
2. Sol / GPT-5.2 class — 76.1
3. Luna

**Terminal / ops / agentic tool use:**
1. Sol — 88.8
2. Kimi K3 — 88.3
3. Luna — 84.3, then DeepSeek V4 Flash 82.7 at $0.11/M

**Research / synthesis:** Grok 4.5 (lane owner), Sol for deep arbitration.

## Implications for deckd routing

- Luna is the right builder lane: 93% agentic, $0.40/M, 1.1M ctx. Confirmed by two independent sources. This includes UI/frontend: 1523 WebDev Arena vs Sol's 1620 is only ~6% behind at 1/25th of the price.
- Kimi K3 tops WebDev Arena (1675) but is NOT in the pool: per-token, not available on Josh's plan, expensive. Do not route to it.
- UI/visual work goes to Luna first. Sol only if Luna visibly fails on a task (Sol stays reserved for architecture/arbitration where it is genuinely 25x better).
- GLM-5.2's LiveBench coding 79.7 confirms Josh's read: it is genuinely strong at UI & code. Weak spot: Terminal-Bench 2.1 24.5 — do NOT assign GLM unguided ops/deploy work; the T5 deploy card is heavily runbook-guided so it should hold, but if it fails, reassign to builder.
- DeepSeek V4 Flash 0731: 82.7 terminal at $0.11/M — the token-brunt is a legit agentic worker; cheap lane for mechanical terminal work.
- Sol remains reserved for serious intelligence; do not burn it on routine builds.

## Routing decisions applied to the kanban queue (2026-08-08)

- T1 relay->lobby UI (builder/Luna, Codex) — running
- T2 multiplayer sync (builder/Luna, gated on T1)
- T3 visual polish (builder/Luna, queued at per-profile cap)
- T4 entitlement HMAC (generalist/GLM-5.2, gated on T1+T2 — code-gen fit, saves Codex quota)
- T5 relay deploy to roxai stack (generalist/GLM-5.2, heavily guided runbook — running)
