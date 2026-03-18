# Best European VPS for under €20/month in 2026

**The European VPS market offers extraordinary value for Docker/PostgreSQL/Redis workloads — five plans deliver 8 vCPU, 16–24 GB RAM, and 160–512 GB NVMe for €7–17/month.** The winner depends on whether you prioritize raw specs per euro (Contabo), dedicated CPU consistency (Netcup RS), rock-solid reliability (Hetzner), or the lowest possible price (HostHatch). US-based providers (Vultr, Linode, DigitalOcean) are completely non-competitive at this budget, starting at **€74/month** for equivalent specs — 4× to 8× more expensive than EU-native alternatives.

Two critical market developments shape 2026 pricing: Hetzner's **30–37% price increase effective April 1, 2026** (driven by DRAM costs surging 171% YoY from AI infrastructure demand), and OVHcloud's **9–11% increase** on the same date. Contabo and Netcup have not announced increases. If you're ordering a Hetzner or OVH server, locking in pre-April pricing now saves meaningful money long-term.

---

## The TOP-5 comparison table

| Rank | Provider | Plan | vCPU | RAM | NVMe | Traffic | €/month | CPU Type |
|:----:|----------|------|:----:|:---:|:----:|:-------:|:-------:|----------|
| 1 | **Contabo** | Cloud VPS 30 | 8 | 24 GB | 200 GB | Unlimited | **~€11.20** (annual) | Shared AMD EPYC |
| 2 | **Hetzner** | CX43 | 8 | 16 GB | 160 GB | 20 TB | **€12.49** (post-Apr) | Shared x86 |
| 3 | **Netcup** | VPS 2000 G12 | 8 | 16 GB | 512 GB | Unlimited | **~€13.10** (ex-VAT) | Shared AMD EPYC 9645 |
| 4 | **Netcup** | RS 2000 G12 | 8 | 16 GB | 512 GB | Unlimited | **~€14.19** (ex-VAT) | **Dedicated** AMD EPYC 9645 |
| 5 | **OVHcloud** | VPS-3 | 8 | 24 GB | 200 GB | Unlimited | **~€12–14** (est.) | Shared Intel |

**Honorable mention:** HostHatch Compute VM NVMe 16 GB at **~€7.70/month** (annual billing) — 4 vCPU (2 dedicated), 16 GB RAM, 200 GB NVMe, 25 TB traffic. The cheapest option overall but only 4 cores, which limits CI runner parallelism.

---

## Contabo Cloud VPS 30 dominates on raw specs per euro

Contabo's Cloud VPS 30 delivers the most resources for the least money: **8 vCPU, 24 GB RAM, 200 GB NVMe, unlimited traffic at ~€11.20/month** on a 12-month contract (€16.95 monthly without commitment). That's 50% more RAM than the minimum requirement, with 200 GB NVMe and a 600 Mbit/s port — all within a single EU datacenter called Hub Europe in Lauterbourg, France, on the Franco-German border.

The catch is well-documented. Contabo aggressively oversells CPU resources. Independent benchmarks from EXPERTE.com (January 2026) scored Contabo **2.3/10 for performance**, recording Geekbench 6 single-core of just 482 (versus 1,442 for Hetzner) and disk IOPS of 21,400 (versus 120,300 at Hostinger). Network throughput averaged 292 Mbit/s despite the 600 Mbit/s port rating. VPSBenchmarks.com paradoxically ranked Contabo #1 globally in 2025–2026, suggesting performance varies significantly by node and time of day. For PostgreSQL query performance and CI runner execution times, this inconsistency is the primary risk.

- **Backup costs:** Auto-backup add-on runs €1.15–€12/month depending on plan; 3 free manual snapshots included
- **Discounts:** 25% off for 12-month commitment (always available); no traditional promo codes
- **EU locations:** Hub Europe (Lauterbourg, FR/DE border) only for EU; ~4 ms to Frankfurt/Paris/Amsterdam
- **Provisioning:** Expect 3+ hours for setup (competitors deliver in seconds)

---

## Hetzner CX43 offers the best reliability-to-price ratio

Hetzner's CX43 plan provides **8 shared vCPU, 16 GB RAM, 160 GB NVMe, and 20 TB traffic for €12.49/month** (post-April 2026, including the mandatory €0.50 IPv4 surcharge, excluding VAT). Before April 1, it's just €9.49/month — one of the best deals in cloud computing. Even after the 33% price hike, CX43 remains competitive because Hetzner's infrastructure quality is a tier above Contabo's.

Hetzner runs local RAID10 NVMe with sequential reads exceeding 1 GB/s. Uptime records show **99.96–99.99%** over 12-month monitoring periods. The platform offers a clean API, full Terraform support, and hourly billing with no commitment. Three EU datacenters — Falkenstein, Nuremberg, and Helsinki — all share identical pricing and plan availability.

The traffic policy deserves clarification: **20 TB is not unlimited**, but overage costs just **€1 per TB** (outbound only), making it effectively unlimited for typical web application workloads. A Docker/Caddy/PostgreSQL/Redis stack serving multiple web apps rarely exceeds 1–2 TB/month unless streaming large files.

The ARM alternative is worth considering. The **CAX31** (8 ARM vCPU on Ampere Altra, 16 GB ECC, 160 GB NVMe) costs **€16.49/month** post-April. Docker, Caddy, PostgreSQL, and Redis all run natively on ARM64, and Ampere Altra delivers superior single-core performance and energy efficiency. The only risk is ensuring every Docker image in your stack has ARM64 builds.

---

## Netcup RS 2000 G12 is the performance king under €20

Netcup's RS (Root Server) 2000 G12 stands alone as the only plan offering **8 dedicated CPU cores** within the budget. At **~€16.89/month including 19% German VAT** (~€14.19 ex-VAT) on a 12-month contract, it provides the latest **AMD EPYC 9645 "Turin" (Zen 5)** processors with DDR5 ECC RAM, a massive **512 GB NVMe** disk, unlimited traffic, and a 2.5 Gbps network port.

Dedicated cores eliminate the "noisy neighbor" problem entirely — critical for CI runners that need consistent build times and PostgreSQL queries that shouldn't stall because another tenant is running a CPU-intensive batch job. The 512 GB NVMe is **5× the minimum requirement** and **3× what Contabo or Hetzner offer** at similar prices, providing enormous headroom for Docker images, PostgreSQL WAL files, and build artifacts.

The shared-CPU sibling, **VPS 2000 G12**, costs ~€15.59/month (€13.10 ex-VAT) with identical specs except shared cores. Netcup's EU locations include Nuremberg (DE), Vienna (AT), and Amsterdam (NL) — the RS series is limited to Nuremberg and Vienna. The 99.9% SLA on RS plans (versus 99.6% on VPS) and a 30-day satisfaction guarantee add meaningful protection.

---

## OVHcloud VPS-3 competes on unlimited traffic and bandwidth

OVHcloud completely overhauled its VPS lineup in late 2025, replacing the old Value/Essential/Comfort/Elite tiers with a new VPS-1 through VPS-6 range. The **VPS-3 offers 8 vCores, 24 GB RAM, 200 GB NVMe, and truly unlimited traffic at an estimated €11–14/month** (ex-VAT) for EU locations, with **1.5 Gbps guaranteed bandwidth** — the highest port speed at this price point.

OVHcloud's unlimited traffic policy in EU/NA datacenters (Gravelines, Strasbourg, Warsaw) has no fair-use cap for standard VPS usage, making it ideal for workloads with unpredictable bandwidth patterns like CI artifact distribution. Daily automatic backups with 24-hour retention are included free.

The primary caveats: exact EUR pricing requires the OVHcloud configurator (prices vary by region and aren't clearly listed on marketing pages), the April 2026 increase will add 9–11%, and the 2021 Strasbourg datacenter fire still haunts OVH's reputation. No vRack (private networking) support on the VPS range means all inter-service communication travels the public network. Support quality is consistently criticized across review platforms. **Lock in a 1–2 year commitment before April 1** to secure current rates.

---

## Why US providers are irrelevant at this budget

Vultr, Linode (Akamai), and DigitalOcean all cluster at **$80–96/month (~€74–89)** for a shared-CPU 16 GB plan — roughly **5× the price** of comparable EU-native offerings. The cheapest qualifying option across all three is Vultr's Regular Performance plan at $80/month with 6 shared vCPU, 16 GB RAM, and 320 GB SSD (not NVMe). Dedicated CPU plans start at $110–173/month.

These providers offer superior developer experience (polished dashboards, extensive APIs, managed databases), wider global reach, and stronger SLAs. Vultr leads with **7 EU locations** (Amsterdam, Frankfurt, London, Paris, Stockholm, Warsaw, Madrid). But for a self-managed Docker/PostgreSQL stack where you're already comfortable with Linux administration, the premium buys nothing that justifies a 4–5× price multiplier.

---

## Detailed plan-by-plan breakdown across all providers

### Plans within the €20/month budget

| Provider | Plan | vCPU | Type | RAM | NVMe | Traffic | Port | EU Locations | €/mo | Contract |
|----------|------|:----:|------|:---:|:----:|:-------:|:----:|-------------|:----:|----------|
| HostHatch | Compute NVMe 16GB | 4 | 2 dedicated | 16 GB | 200 GB | 25 TB | 10 Gbps | AMS, LON, STO, ZRH | ~€7.70 | Annual |
| Contabo | Cloud VPS 30 | 8 | Shared | 24 GB | 200 GB | Unlimited | 600 Mbps | Hub Europe (FR/DE) | ~€11.20 | 12-mo |
| OVHcloud | VPS-3 | 8 | Shared | 24 GB | 200 GB | Unlimited | 1.5 Gbps | GRA, SBG, WAW | ~€12–14 | Monthly |
| Hetzner | CX43 | 8 | Shared | 16 GB | 160 GB | 20 TB | — | FSN, NBG, HEL | €12.49 | Hourly |
| Netcup | VPS 2000 G12 | 8 | Shared | 16 GB | 512 GB | Unlimited | 2.5 Gbps | NUE, VIE, AMS | ~€13.10* | 12-mo |
| Netcup | RS 2000 G12 | 8 | **Dedicated** | 16 GB | 512 GB | Unlimited | 2.5 Gbps | NUE, VIE | ~€14.19* | 12-mo |
| Hetzner | CAX31 (ARM) | 8 | Shared ARM | 16 GB | 160 GB | 20 TB | — | FSN, NBG, HEL | €16.49 | Hourly |
| Contabo | Cloud VPS 30 | 8 | Shared | 24 GB | 200 GB | Unlimited | 600 Mbps | Hub Europe (FR/DE) | ~€16.95 | Monthly |
| Time4VPS | Linux 16 | 4 | Shared | 16 GB | 160 GB SSD | 16 TB | 100 Mbps | Vilnius (LT) | €17.99 | Monthly |
| Contabo | Cloud VPS 40 | 12 | Shared | 48 GB | 250 GB | Unlimited | 800 Mbps | Hub Europe (FR/DE) | ~€20.00 | 12-mo |

*Netcup prices ex-VAT; incl. 19% DE VAT: VPS 2000 = €15.59, RS 2000 = €16.89

### Plans over budget (for reference)

| Provider | Plan | vCPU | RAM | Disk | Traffic | €/mo |
|----------|------|:----:|:---:|:----:|:-------:|:----:|
| Hetzner CX53 | 16 shared | 32 GB | 320 GB NVMe | 20 TB | €22.99 (post-Apr) |
| Hetzner CPX42 | 8 shared AMD | 16 GB | 320 GB NVMe | 20 TB | €25.99 (post-Apr) |
| Hetzner CCX23 | 4 dedicated | 16 GB | 160 GB NVMe | 20 TB | €31.99 (post-Apr) |
| Vultr Regular | 6 shared | 16 GB | 320 GB SSD | 5 TB | ~€74 |
| Linode Shared | 6 shared | 16 GB | 320 GB SSD | 8 TB | ~€89 |
| DigitalOcean Basic | 8 shared | 16 GB | 320 GB SSD | 6 TB | ~€89 |

---

## Final recommendation for Docker, Caddy, PostgreSQL, Redis, and CI runners

**Primary recommendation: Netcup RS 2000 G12 at ~€16.89/month (incl. VAT).** The dedicated AMD EPYC 9645 cores guarantee consistent PostgreSQL query latency and predictable CI build times — the two most CPU-sensitive workloads in the stack. The **512 GB NVMe** provides massive headroom for Docker images, database WAL segments, build caches, and log retention. Unlimited traffic on a 2.5 Gbps port handles any realistic web traffic pattern. The 12-month commitment is reasonable for a long-term server.

**Budget alternative: Contabo Cloud VPS 30 at ~€11.20/month (annual).** Choose this if saving €5.70/month matters more than CPU consistency. You get 24 GB RAM (50% more than Netcup) and 200 GB NVMe, but shared CPU with documented performance variability. Ideal if your workloads are more I/O-bound and memory-bound than CPU-bound.

**Reliability-first alternative: Hetzner CX43 at €12.49/month.** Choose this if uptime and infrastructure quality matter most. Hetzner's ecosystem (API, Terraform, clean dashboard, hourly billing, no commitment) is best-in-class among budget providers. The 160 GB NVMe is the smallest qualifying disk — consider adding a €4.36/month 100 GB volume if storage becomes tight.

**For ARM-compatible stacks: Hetzner CAX31 at €16.49/month.** If every component in your stack builds for ARM64 (Docker, Caddy, PostgreSQL, Redis all do), Ampere Altra delivers better per-core performance and energy efficiency than shared x86 alternatives.

**Action item regardless of choice:** If selecting Hetzner or OVHcloud, **order before April 1, 2026** to lock in pre-increase pricing. OVHcloud explicitly allows locking current rates with 1–2 year prepayment. Hetzner does not offer pre-pay discounts but the price increase applies to all existing and new customers on April 1.