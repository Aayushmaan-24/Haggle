"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useNegotiation } from "@/lib/useNegotiation";
import { payDeal } from "@/lib/api";
import type { NegotiationEvent } from "@/lib/types";

const COLORS = ["#f59e0b", "#34d399", "#a78bfa", "#38bdf8"];
const MAX_ROUND = 5;

type Msg = {
  who: "buyer" | "seller";
  price: number;
  deposit: number;
  days: number;
  message: string;
  round: number;
};

type Lane = {
  name: string;
  color: string;
  msgs: Msg[];
  pts: { round: number; price: number }[];
};

function money(n: number): string {
  return "$" + n.toFixed(2);
}

/** Folds the raw event stream into one lane per seller. Handles the `reset`
 *  event, which the hook does not apply to the offer list. */
function buildLanes(events: NegotiationEvent[]): Lane[] {
  const lanes: Lane[] = [];
  let round = 0;
  for (const e of events) {
    if (e.type === "round") {
      round = e.n;
    } else if (e.type === "reset") {
      lanes.length = 0;
      round = 0;
    } else if (e.type === "offer") {
      let lane = lanes.find((l) => l.name === e.seller);
      if (!lane) {
        lane = { name: e.seller, color: COLORS[lanes.length % COLORS.length], msgs: [], pts: [] };
        lanes.push(lane);
      }
      lane.msgs.push({
        who: e.who,
        price: e.price,
        deposit: e.deposit_percent,
        days: e.delivery_days,
        message: e.message,
        round,
      });
      if (e.who === "seller") lane.pts.push({ round, price: e.price });
    }
  }
  return lanes;
}

function LaneFeed({ msgs }: { msgs: Msg[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);
  return (
    <div ref={ref} className="flex h-64 flex-col gap-2 overflow-y-auto pr-1">
      {msgs.map((m, i) => (
        <div
          key={i}
          className={
            m.who === "buyer"
              ? "max-w-[92%] self-end rounded-2xl rounded-br-sm bg-cyan-500/15 px-3 py-2 text-sm"
              : "max-w-[92%] self-start rounded-2xl rounded-bl-sm bg-white/[0.06] px-3 py-2 text-sm"
          }
        >
          <div className="mb-0.5 text-[11px] uppercase tracking-wide text-white/50">
            {m.who === "buyer" ? "Your agent" : "Seller"} · {money(m.price)} · {Math.round(m.deposit)}% deposit · {m.days}d
          </div>
          <div className="text-white/90">{m.message}</div>
        </div>
      ))}
    </div>
  );
}

function PriceChart({ lanes, target }: { lanes: Lane[]; target: number }) {
  const all = lanes.flatMap((l) => l.pts.map((p) => p.price));
  if (all.length < 2) return null;
  const W = 720;
  const H = 240;
  const L = 48;
  const R = 16;
  const T = 16;
  const B = 28;
  const lo = Math.floor(Math.min(...all, target) - 3);
  const hi = Math.ceil(Math.max(...all, target) + 3);
  const x = (r: number) => L + (r / MAX_ROUND) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const label = "rgba(255,255,255,0.5)";
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <text key={r} x={x(r)} y={H - 8} fill={label} fontSize="12" textAnchor="middle">
            {r === 0 ? "Open" : "R" + r}
          </text>
        ))}
        <text x="6" y={y(hi) + 4} fill={label} fontSize="12">${hi}</text>
        <text x="6" y={y(lo) + 4} fill={label} fontSize="12">${lo}</text>
        <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} stroke="#38bdf8" strokeDasharray="6 5" />
        <text x={W - R} y={y(target) - 6} fill="#38bdf8" fontSize="12" textAnchor="end">
          Your target {money(target)}
        </text>
        {lanes.map((l) =>
          l.pts.length === 0 ? null : (
            <g key={l.name}>
              <polyline
                fill="none"
                stroke={l.color}
                strokeWidth="3"
                strokeLinejoin="round"
                points={l.pts.map((p) => `${x(p.round)},${y(p.price)}`).join(" ")}
              />
              <circle
                cx={x(l.pts[l.pts.length - 1].round)}
                cy={y(l.pts[l.pts.length - 1].price)}
                r="5"
                fill={l.color}
              />
            </g>
          ),
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/70">
        {lanes.map((l) => (
          <span key={l.name} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-violet-400";

export default function TradingFloorPage() {
  const [state, control] = useNegotiation();
  const [item, setItem] = useState("a 27-inch monitor");
  const [budget, setBudget] = useState("90");
  const [target, setTarget] = useState("85");
  const [replay, setReplay] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [run, setRun] = useState<{ target: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const events = state.events as unknown as NegotiationEvent[];
  const lanes = useMemo(() => buildLanes(events), [events]);

  const notice = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "notice") return e.message;
    }
    return null;
  }, [events]);

  const serverError = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "error") return e.message;
    }
    return null;
  }, [events]);

  const result = state.result;
  const winner = result?.winner ?? null;
  const running =
    (state.connectionStatus === "connecting" || state.connectionStatus === "open") && result === null;
  const dealId = state.deal?.deal_id ?? result?.deal_id ?? null;
  const alreadyPaid = state.deal !== null && state.deal.status !== "negotiated";

  function start() {
    const b = Number(budget);
    const t = Number(target);
    if (!item.trim()) {
      setFormError("Describe what you want to buy.");
      return;
    }
    if (!(b > 0) || !(t > 0) || t > b) {
      setFormError("The target must be above $0 and not above the budget.");
      return;
    }
    setFormError(null);
    setPayError(null);
    setRun({ target: t });
    void control.startNegotiation({ item: item.trim(), budget: b, target: t, replay });
  }

  async function pay() {
    if (!dealId) return;
    setPaying(true);
    setPayError(null);
    try {
      const r = await payDeal(dealId);
      window.location.href = r.approve_url;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : String(err));
      setPaying(false);
    }
  }

  function badge(name: string): { label: string; cls: string; dim: boolean } {
    const s = state.sellerStatuses[name];
    if (result) {
      if (winner && winner.seller === name)
        return { label: "Winner", cls: "bg-emerald-400/20 text-emerald-300", dim: false };
      if (s === "deal") return { label: "Not selected", cls: "bg-white/10 text-white/60", dim: true };
      return { label: "Out", cls: "bg-rose-400/15 text-rose-300", dim: true };
    }
    if (s === "deal") return { label: "Deal reached", cls: "bg-emerald-400/15 text-emerald-300", dim: false };
    if (s === "out") return { label: "Out", cls: "bg-rose-400/15 text-rose-300", dim: true };
    return { label: running ? "Negotiating" : "Waiting", cls: "bg-violet-400/15 text-violet-300", dim: false };
  }

  const statusText = (() => {
    if (state.connectionStatus === "connecting") return "Connecting to sellers...";
    if (running) {
      return state.currentRound === 0
        ? "Sellers are posting opening offers"
        : `Round ${state.currentRound} of ${MAX_ROUND}`;
    }
    if (result) return "Negotiation finished";
    return "";
  })();

  const depositAmount = winner
    ? (state.deal?.deposit ?? (winner.price * winner.deposit_percent) / 100)
    : 0;
  const balanceAmount = winner ? (state.deal?.balance ?? winner.price - depositAmount) : 0;
  const saved = winner && result?.list_price ? result.list_price - winner.price : 0;
  const savedPct = winner && result?.list_price ? (saved / result.list_price) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-violet-300">Trading Floor</div>
        <h1 className="mt-1 text-3xl font-bold text-white">Watch your agent negotiate</h1>
        <p className="mt-1 text-white/60">
          One buyer agent haggles with every seller at once, then the best deal is paid through PayPal.
        </p>
      </div>

      {/* Mandate bar */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="grid items-end gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="text-sm text-white/60">
            What do you want to buy?
            <input className={INPUT + " mt-1"} value={item} onChange={(e) => setItem(e.target.value)} />
          </label>
          <label className="text-sm text-white/60">
            Maximum budget ($)
            <input
              className={INPUT + " mt-1"}
              type="number"
              min="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
          <label className="text-sm text-white/60">
            Target price ($)
            <input
              className={INPUT + " mt-1"}
              type="number"
              min="1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={start}
              disabled={running}
              className="rounded-lg bg-violet-500 px-5 py-2 font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
            >
              {result ? "Negotiate again" : "Start negotiation"}
            </button>
            {running && (
              <button
                onClick={control.stopListening}
                className="rounded-lg border border-white/15 px-4 py-2 text-white/80 hover:bg-white/5"
              >
                Stop watching
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 text-white/60">
            <input type="checkbox" checked={replay} onChange={(e) => setReplay(e.target.checked)} />
            Use a recorded negotiation (instant, no AI calls)
          </label>
          <span className="text-white/60">{statusText}</span>
        </div>
        {running && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-violet-400 transition-all"
              style={{ width: `${Math.min(100, (state.currentRound / MAX_ROUND) * 100)}%` }}
            />
          </div>
        )}
        {formError && <p className="mt-3 text-sm text-rose-300">{formError}</p>}
      </div>

      {/* Banners */}
      {notice && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-amber-200">
          {notice}
        </div>
      )}
      {(state.error || serverError) && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-rose-200">
          Something went wrong: {state.error ?? serverError}. Try again, or tick the recorded negotiation option.
        </div>
      )}

      {/* Outcome */}
      {result && winner && (
        <div className="rounded-2xl border border-emerald-400/50 bg-emerald-400/[0.07] p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Best deal found</div>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {winner.seller} wins at {money(winner.price)}
          </h2>
          <p className="mt-1 text-white/70">
            {saved > 0
              ? `You save ${money(saved)} (${savedPct.toFixed(1)}%) off its list price. `
              : ""}
            {Math.round(winner.deposit_percent)}% deposit, delivered in {winner.delivery_days} days.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {alreadyPaid && dealId ? (
              <Link
                href={`/receipt?deal=${dealId}`}
                className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-emerald-950 hover:bg-emerald-400"
              >
                View receipt
              </Link>
            ) : (
              <button
                onClick={pay}
                disabled={!dealId || paying}
                className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {paying ? "Opening PayPal..." : `Pay ${money(depositAmount)} deposit with PayPal`}
              </button>
            )}
            <span className="text-sm text-white/60">
              The remaining {money(balanceAmount)} is released when you confirm delivery.
            </span>
          </div>
          {payError && <p className="mt-3 text-sm text-rose-300">{payError}</p>}
        </div>
      )}
      {result && !winner && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-rose-200">
          No seller could meet your limits. Try a higher budget or a later target.
        </div>
      )}

      {/* Seller lanes */}
      {lanes.length > 0 ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {lanes.map((lane) => {
            const b = badge(lane.name);
            const isWinner = winner?.seller === lane.name;
            const last = lane.pts[lane.pts.length - 1];
            const prev = lane.pts.length > 1 ? lane.pts[lane.pts.length - 2] : null;
            const drop = last && prev ? prev.price - last.price : 0;
            return (
              <div
                key={lane.name}
                className={
                  "flex flex-col gap-3 rounded-2xl border p-4 " +
                  (isWinner ? "border-emerald-400/70 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.03]") +
                  (b.dim ? " opacity-60" : "")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold" style={{ color: lane.color }}>
                    {lane.name}
                  </span>
                  <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + b.cls}>{b.label}</span>
                </div>
                <div>
                  <div className="text-4xl font-bold text-white">{last ? money(last.price) : "-"}</div>
                  <div className="mt-1 h-5 text-sm text-emerald-300">
                    {drop > 0 ? `Lowered ${money(drop)} since last round` : ""}
                  </div>
                </div>
                <LaneFeed msgs={lane.msgs} />
              </div>
            );
          })}
        </div>
      ) : (
        !running &&
        !state.error && (
          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-white/60">
            Press Start negotiation to watch your agent work with every seller at once.
          </div>
        )
      )}

      {/* Chart */}
      {lanes.some((l) => l.pts.length > 1) && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-3 font-semibold text-white">How each seller price came down</h2>
          <PriceChart lanes={lanes} target={run?.target ?? Number(target)} />
        </div>
      )}

      {/* Offer comparison */}
      {result && result.ranking.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold text-white">Final offers compared</h2>
          <p className="mb-3 text-sm text-white/60">
            Ranked by a score that adds the cost of the deposit and the wait for delivery to the price. Lower is better.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/50">
                <tr>
                  <th className="py-2 pr-4 font-medium">Seller</th>
                  <th className="py-2 pr-4 font-medium">Price</th>
                  <th className="py-2 pr-4 font-medium">Deposit</th>
                  <th className="py-2 pr-4 font-medium">Delivery</th>
                  <th className="py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {result.ranking.map((r, i) => (
                  <tr key={r.seller} className="border-t border-white/10 text-white/90">
                    <td className="py-2 pr-4">
                      {r.seller}
                      {i === 0 && (
                        <span className="ml-2 rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs text-emerald-300">
                          Winner
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{money(r.price)}</td>
                    <td className="py-2 pr-4">{Math.round(r.deposit_percent)}%</td>
                    <td className="py-2 pr-4">{r.delivery_days} days</td>
                    <td className="py-2">{r.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
