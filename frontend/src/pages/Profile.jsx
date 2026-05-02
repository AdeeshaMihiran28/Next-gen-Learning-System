import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";

function fmt(dt) {
  try {
    if (!dt) return "N/A";
    return new Date(dt).toLocaleString();
  } catch {
    return "N/A";
  }
}

function pct(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------- Level Bars ---------------- */
function LevelBars({ report }) {
  const levels = report?.levels || {};
  const rows = [
    { k: "GOOD", label: "Good" },
    { k: "PARTIAL", label: "Partial" },
    { k: "WEAK", label: "Weak" },
    { k: "INCORRECT", label: "Incorrect" },
  ];

  const barClass = (k) => {
    if (k === "GOOD") return "bg-green-500";
    if (k === "PARTIAL") return "bg-yellow-500";
    if (k === "WEAK") return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const p = pct(levels?.[r.k]?.percent);
        const c = levels?.[r.k]?.count ?? 0;
        return (
          <div key={r.k}>
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
              <span className="font-semibold">{r.label}</span>
              <span>
                {c} ({p}%)
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={`h-3 ${barClass(r.k)}`}
                style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Topic Bars ---------------- */
function TopicBars({ topicBars }) {
  const barClass = (percent, misconception) => {
    if (misconception) return "bg-red-500";
    if (percent >= 85) return "bg-green-500";
    if (percent >= 60) return "bg-blue-500";
    if (percent >= 40) return "bg-yellow-500";
    return "bg-orange-500";
  };

  return (
    <div className="space-y-4">
      {(topicBars || []).map((t) => {
        const p = pct(t.percent);
        return (
          <div key={t.topic}>
            <div className="flex items-center justify-between text-sm">
              <div className="font-semibold text-gray-900 dark:text-white">
                {t.topic}
              </div>

              <div className="flex items-center gap-2">
                {t.misconception ? (
                  <span className="text-xs font-bold text-red-600">
                    Misconception Detected ⚠️
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {t.status}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2 h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={`h-3 ${barClass(p, t.misconception)}`}
                style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
              />
            </div>

            <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 flex justify-between">
              <span>{p}%</span>
              <span>
                avg: {t.avg_marks}/10 • voice: {t.voice_label || "N/A"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Scatter Chart (SVG) ---------------- */
function ScatterChart({ points }) {
  const w = 520;
  const h = 280;
  const pad = 40;

  const xToPx = (x) =>
    pad + (Math.max(0, Math.min(10, x)) / 10) * (w - pad * 2);
  const yToPx = (y) =>
    h - pad - (Math.max(0, Math.min(1, y)) / 1) * (h - pad * 2);

  const xAxisY = h - pad;
  const yAxisX = pad;

  const gridXs = [0, 5, 10];
  const gridYs = [0, 0.5, 1];

  const colorFor = (p) => {
    const lab = (p.voice_label || "").toLowerCase();
    if (lab === "confident") return "#16a34a";
    if (lab === "hesitant") return "#f59e0b";
    if (lab === "nervous") return "#ef4444";
    return "#64748b";
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={w}
        height={h}
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700"
      >
        {gridXs.map((gx) => (
          <g key={`gx-${gx}`}>
            <line
              x1={xToPx(gx)}
              y1={pad}
              x2={xToPx(gx)}
              y2={h - pad}
              stroke="#e5e7eb"
              strokeDasharray="4 4"
            />
            <text
              x={xToPx(gx)}
              y={h - 12}
              fontSize="10"
              textAnchor="middle"
              fill="#6b7280"
            >
              {gx}
            </text>
          </g>
        ))}

        {gridYs.map((gy) => (
          <g key={`gy-${gy}`}>
            <line
              x1={pad}
              y1={yToPx(gy)}
              x2={w - pad}
              y2={yToPx(gy)}
              stroke="#e5e7eb"
              strokeDasharray="4 4"
            />
            <text
              x={18}
              y={yToPx(gy) + 4}
              fontSize="10"
              textAnchor="start"
              fill="#6b7280"
            >
              {gy}
            </text>
          </g>
        ))}

        <line x1={yAxisX} y1={pad} x2={yAxisX} y2={xAxisY} stroke="#9ca3af" />
        <line
          x1={yAxisX}
          y1={xAxisY}
          x2={w - pad}
          y2={xAxisY}
          stroke="#9ca3af"
        />

        <text
          x={w / 2}
          y={h - 2}
          fontSize="11"
          textAnchor="middle"
          fill="#374151"
        >
          Knowledge Score (0–10)
        </text>

        <text
          x={12}
          y={h / 2}
          fontSize="11"
          textAnchor="middle"
          fill="#374151"
          transform={`rotate(-90 12 ${h / 2})`}
        >
          Confidence Level (Low→High)
        </text>

        {(points || []).map((p) => {
          const cx = xToPx(Number(p.x || 0));
          const cy = yToPx(Number(p.y || 0));
          const col = colorFor(p);

          return (
            <g key={p.topic}>
              <circle cx={cx} cy={cy} r="6" fill={col} opacity="0.9" />
              <text x={cx + 8} y={cy + 4} fontSize="10" fill="#111827">
                {p.topic}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------- Feedback Card ---------------- */
function FeedbackCard({ feedback }) {
  const fb = feedback || {};
  const msgs = fb.messages || {};

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-gray-900 dark:text-white">
          Feedback
        </div>

        {fb.misconception ? (
          <span className="text-xs font-bold text-red-600">
            ⚠️ Misconception Detected
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="text-xs font-bold text-gray-600 dark:text-gray-300">
            Main
          </div>
          <div className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
            {msgs.main || "N/A"}
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-gray-600 dark:text-gray-300">
            Best Topic Tip
          </div>
          <div className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
            {msgs.best_topic || "N/A"}
          </div>
        </div>

        <div className="text-xs text-gray-600 dark:text-gray-300">
          Worst Topic: <b>{fb.worst_topic || "N/A"}</b> • Best Topic:{" "}
          <b>{fb.best_topic || "N/A"}</b> • Voice:{" "}
          <b>{fb.voice_for_feedback || fb.overall_voice || "N/A"}</b>
        </div>
      </div>
    </div>
  );
}

/* ============================= PAGE ============================= */
export default function Profile() {
  const [me, setMe] = useState(null);
  const [summary, setSummary] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [open, setOpen] = useState({});

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        setLoading(true);

        const meData = await apiFetch("/api/auth/me");
        setMe(meData?.user || null);

        const sum = await apiFetch("/api/quiz/submitted-summary");
        setSummary(sum || null);

        const q = await apiFetch("/api/quiz/submitted");
        setQuizzes(q?.items || []);
      } catch (e) {
        setErr(e?.message || "Something went wrong");
        setMe(null);
        setSummary(null);
        setQuizzes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (sid) => setOpen((p) => ({ ...p, [sid]: !p[sid] }));

  if (loading) return <div className="p-8">Loading profile...</div>;

  if (err)
    return (
      <div className="p-8">
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          {err}
        </div>
      </div>
    );

  if (!me) return <div className="p-8">No user data</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* USER CARD */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            👤 My Profile
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Logged in account information
          </p>

          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">Name</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {me.name || "N/A"}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">Email</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {me.email || "N/A"}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">User ID</div>
              <div className="text-sm font-mono text-gray-900 dark:text-white break-all">
                {me.id}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Created At
              </div>
              <div className="text-sm text-gray-900 dark:text-white">
                {fmt(me.created_at)}
              </div>
            </div>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <div className="text-xs text-gray-500 dark:text-gray-400">Attempts</div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">
              {summary?.total_attempts ?? 0}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Average Score
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">
              {summary?.avg_percent ?? 0}%
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Total Questions
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">
              {summary?.total_questions ?? 0}
            </div>
          </div>
        </div>

        {/* ALL QUIZZES */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
            ✅ All Completed Quizzes
          </h2>

          {quizzes.length === 0 ? (
            <div className="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200">
              No submitted quizzes found.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {quizzes.map((q) => {
                const isOpen = !!open[q.session_id];
                const scoreText = q.max_marks
                  ? `${q.total_marks} / ${q.max_marks}`
                  : `${q.total_marks}`;

                return (
                  <div
                    key={q.session_id}
                    className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                  >
                    <button
                      onClick={() => toggle(q.session_id)}
                      className="w-full text-left p-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-950 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Submitted: {fmt(q.submitted_at)}
                          </div>
                          <div className="text-lg font-extrabold text-gray-900 dark:text-white">
                            Score: {scoreText} • Mode: {q.mode || "N/A"}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">
                            Best: {q.best_topic || "N/A"} • Worst:{" "}
                            {q.worst_topic || "N/A"} • Voice:{" "}
                            {q.overall_voice || "N/A"}
                          </div>
                        </div>

                        <div className="text-sm font-bold text-gray-900 dark:text-white">
                          {isOpen ? "Hide ▲" : "View ▼"}
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="p-5 bg-white dark:bg-gray-800 space-y-6">
                        <div>
                          <h3 className="font-extrabold text-gray-900 dark:text-white mb-2">
                            Level Breakdown (%)
                          </h3>
                          <LevelBars report={q.report_summary} />
                        </div>

                        <div>
                          <h3 className="font-extrabold text-gray-900 dark:text-white mb-2">
                            Topic-Wise Breakdown
                          </h3>
                          <TopicBars topicBars={q.topic_bars} />
                        </div>

                        <div>
                          <h3 className="font-extrabold text-gray-900 dark:text-white mb-2">
                            Knowledge vs Confidence
                          </h3>
                          <ScatterChart points={q.scatter_points} />
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                            Confident (green), Hesitant (orange), Nervous (red)
                          </div>
                        </div>

                        {/* ✅ FEEDBACK ONLY (NO QUESTIONS) */}
                        <div>
                          <h3 className="font-extrabold text-gray-900 dark:text-white mb-2">
                            Feedback
                          </h3>
                          <FeedbackCard feedback={q.feedback} />
                        </div>

                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Session:{" "}
                          <span className="font-mono">{q.session_id}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
