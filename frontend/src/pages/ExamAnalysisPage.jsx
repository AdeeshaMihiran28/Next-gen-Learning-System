import { useEffect, useState, useCallback } from 'react';

const API = 'http://localhost:8000';

/* ─── helpers ─── */
function gradeFromPercentage(p) {
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B';
    if (p >= 60) return 'C';
    if (p >= 50) return 'D';
    return 'F';
}

function gradeColor(g) {
    if (!g) return '#94a3b8';
    if (g === 'A+' || g === 'A') return '#22c55e';
    if (g === 'B') return '#3b82f6';
    if (g === 'C') return '#f59e0b';
    if (g === 'D') return '#f97316';
    return '#ef4444';
}

function severityColor(sev) {
    if (sev === 'critical') return '#ef4444';
    if (sev === 'warning') return '#f59e0b';
    return '#6b7280';
}

function intentBadge(intent) {
    if (!intent) return null;
    const colors = {
        CHEATING: { bg: '#fecaca', text: '#991b1b', border: '#f87171' },
        SUSPICIOUS: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
        NORMAL: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    };
    const c = colors[intent] || colors.NORMAL;
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 700, letterSpacing: .5,
            background: c.bg, color: c.text, border: `1px solid ${c.border}`
        }}>
            {intent}
        </span>
    );
}

function fmtTime(ts) {
    if (!ts) return '—';
    try {
        const d = new Date(ts);
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ts; }
}

/* ─── Stat Card ─── */
function StatCard({ icon, label, value, color = '#06b6d4' }) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,.08) 0%, rgba(59,130,246,.06) 100%)',
            border: '1px solid rgba(6,182,212,.18)',
            borderRadius: 16, padding: '20px 24px',
            display: 'flex', alignItems: 'center', gap: 16,
            minWidth: 180
        }}>
            <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: `linear-gradient(135deg, ${color}22, ${color}11)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, letterSpacing: .3 }}>{label}</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════  STUDENT DETAIL MODAL  ═══════════════════════════ */
function StudentDetailModal({ session, onClose }) {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('violations'); // violations | transcripts | timeline

    useEffect(() => {
        if (!session) return;
        setLoading(true);
        fetch(`${API}/exam-sessions/${session.id}`)
            .then(r => r.json())
            .then(d => { setDetail(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [session]);

    if (!session) return null;

    const violations = (detail?.events || []).filter(e => e.event_type === 'violation');
    const noFace = (detail?.events || []).filter(e => e.event_type === 'no_face');
    // Only show transcripts that have actual speech text or an error
    const transcripts = (detail?.events || []).filter(e => {
        if (e.event_type !== 'transcript') return false;
        const d = e.data || {};
        return !!d.transcript || !!d.error;
    });
    // Filter timeline to include transcripts
    const allEvents = (detail?.events || []).filter(e => {
        if (e.event_type === 'transcript') {
            const d = e.data || {};
            return !!d.transcript || !!d.error;
        }
        return true;
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn .25s ease'
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '90%', maxWidth: 960, maxHeight: '90vh',
                background: 'var(--bg-card, #1f2937)', borderRadius: 24,
                border: '1px solid rgba(255,255,255,.08)',
                boxShadow: '0 32px 64px rgba(0,0,0,.45)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                animation: 'scaleIn .3s ease'
            }}>
                {/* ─── Modal Header ─── */}
                <div style={{
                    padding: '28px 32px 20px',
                    borderBottom: '1px solid rgba(255,255,255,.06)',
                    background: 'linear-gradient(135deg, rgba(6,182,212,.06) 0%, rgba(59,130,246,.04) 100%)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 20, fontWeight: 800, color: '#fff'
                                }}>
                                    {(session.student || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                                        {session.student}
                                    </h2>
                                    <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                                        {session.exam_topic || 'Exam Session'} &middot; {fmtTime(session.started_at)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} style={{
                            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 12, width: 40, height: 40, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#94a3b8', fontSize: 18, transition: 'all .2s'
                        }}
                            onMouseEnter={e => { e.target.style.background = 'rgba(239,68,68,.15)'; e.target.style.color = '#ef4444'; }}
                            onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,.06)'; e.target.style.color = '#94a3b8'; }}
                        >✕</button>
                    </div>

                    {/* Quick Stats Row */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
                        <StatCard icon="📊" label="Score" value={session.percentage != null ? `${session.percentage}%` : '—'} color="#22c55e" />
                        <StatCard icon="⚠️" label="Violations" value={session.violation_count ?? violations.length} color="#ef4444" />
                        <StatCard icon="👤" label="No Face" value={session.no_face_count ?? noFace.length} color="#f59e0b" />
                        <StatCard icon="🎙️" label="Transcripts" value={session.transcript_count ?? transcripts.length} color="#8b5cf6" />
                    </div>
                </div>

                {/* ─── Tabs ─── */}
                <div style={{
                    display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,.06)',
                    padding: '0 32px', background: 'rgba(0,0,0,.1)'
                }}>
                    {[
                        { key: 'violations', label: '⚠️ Violations', count: violations.length + noFace.length },
                        { key: 'transcripts', label: '🎙️ Speech & Meaning', count: transcripts.length },
                        { key: 'timeline', label: '📋 Full Timeline', count: allEvents.length },
                    ].map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} style={{
                            padding: '14px 20px', border: 'none', cursor: 'pointer',
                            background: 'none', color: tab === t.key ? '#06b6d4' : '#94a3b8',
                            fontSize: 13, fontWeight: 600,
                            borderBottom: tab === t.key ? '2px solid #06b6d4' : '2px solid transparent',
                            transition: 'all .2s'
                        }}>
                            {t.label} <span style={{
                                background: tab === t.key ? 'rgba(6,182,212,.18)' : 'rgba(148,163,184,.12)',
                                padding: '2px 8px', borderRadius: 10, fontSize: 11, marginLeft: 6
                            }}>{t.count}</span>
                        </button>
                    ))}
                </div>

                {/* ─── Tab Body ─── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 32px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                            <div className="animate-pulse" style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
                            Loading session data...
                        </div>
                    ) : (
                        <>
                            {/* VIOLATIONS TAB */}
                            {tab === 'violations' && (
                                <div>
                                    {violations.length === 0 && noFace.length === 0 ? (
                                        <EmptyState icon="✅" title="No Violations" subtitle="This student had a clean exam session" />
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {[...violations, ...noFace].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((ev, i) => (
                                                <EventCard key={i} event={ev} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TRANSCRIPTS TAB */}
                            {tab === 'transcripts' && (
                                <div>
                                    {transcripts.length === 0 ? (
                                        <EmptyState icon="🔇" title="No Speech Detected" subtitle="No audio transcripts were captured during this session" />
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            {transcripts.map((ev, i) => (
                                                <TranscriptCard key={i} event={ev} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TIMELINE TAB */}
                            {tab === 'timeline' && (
                                <div>
                                    {allEvents.length === 0 ? (
                                        <EmptyState icon="📭" title="No Events" subtitle="No events were recorded for this session" />
                                    ) : (
                                        <div style={{ position: 'relative', paddingLeft: 28 }}>
                                            {/* Timeline line */}
                                            <div style={{
                                                position: 'absolute', left: 9, top: 8, bottom: 8, width: 2,
                                                background: 'linear-gradient(to bottom, #06b6d4, #3b82f6, #8b5cf6)',
                                                borderRadius: 2, opacity: .3
                                            }} />
                                            {allEvents.map((ev, i) => (
                                                <TimelineItem key={i} event={ev} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ──── Sub-components for the modal ──── */

function EmptyState({ icon, title, subtitle }) {
    return (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
            <div style={{ fontSize: 56, marginBottom: 12, opacity: .6 }}>{icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, opacity: .7 }}>{subtitle}</div>
        </div>
    );
}

function EventCard({ event }) {
    const d = event.data || {};
    const type = d.alert_type || event.event_type;
    const isNoFace = event.event_type === 'no_face' || type === 'NO_FACE';
    return (
        <div style={{
            padding: '16px 20px', borderRadius: 14,
            background: isNoFace
                ? 'linear-gradient(135deg, rgba(249,115,22,.06), rgba(249,115,22,.02))'
                : 'linear-gradient(135deg, rgba(239,68,68,.06), rgba(239,68,68,.02))',
            border: `1px solid ${isNoFace ? 'rgba(249,115,22,.15)' : 'rgba(239,68,68,.15)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: isNoFace ? 'rgba(249,115,22,.12)' : 'rgba(239,68,68,.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18
                }}>
                    {isNoFace ? '👤' : '⚠️'}
                </div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {(type || '').replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {d.message_en || (isNoFace ? 'Face not detected in frame' : 'Violation detected')}
                    </div>
                    {d.severity && (
                        <span style={{
                            display: 'inline-block', marginTop: 4,
                            padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                            background: `${severityColor(d.severity)}22`, color: severityColor(d.severity)
                        }}>
                            {d.severity.toUpperCase()}
                        </span>
                    )}
                </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                🕐 {fmtTime(event.timestamp)}
            </div>
        </div>
    );
}

function TranscriptCard({ event }) {
    const d = event.data || {};
    return (
        <div style={{
            padding: '20px 24px', borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(139,92,246,.05), rgba(6,182,212,.03))',
            border: '1px solid rgba(139,92,246,.12)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🎙️</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Speech Detected</span>
                </div>
                <span style={{ fontSize: 12, color: '#64748b' }}>🕐 {fmtTime(event.timestamp)}</span>
            </div>

            {/* Transcript Text */}
            <div style={{
                padding: '14px 18px', borderRadius: 12,
                background: 'rgba(0,0,0,.15)', border: '1px solid rgba(255,255,255,.05)',
                marginBottom: 14
            }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, letterSpacing: .5 }}>WHAT THEY SAID</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    {d.transcript ? (
                        <span>"{d.transcript}"</span>
                    ) : d.error ? (
                        <span style={{ color: '#f87171' }}>Error: {d.error}</span>
                    ) : (
                        <em style={{ color: '#64748b' }}>No transcript available</em>
                    )}
                </div>
            </div>

            {/* Intent / Meaning Analysis */}
            {d.intent && (
                <div style={{
                    padding: '14px 18px', borderRadius: 12,
                    background: 'rgba(0,0,0,.1)', border: '1px solid rgba(255,255,255,.04)'
                }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, letterSpacing: .5 }}>MEANING & INTENT ANALYSIS</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        {intentBadge(d.intent.intent)}
                        {d.intent.score != null && (
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                Confidence: <strong style={{ color: 'var(--text-primary)' }}>{(d.intent.score * 100).toFixed(0)}%</strong>
                            </span>
                        )}
                    </div>
                    {d.intent.matches && d.intent.matches.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>Matched keywords: </span>
                            {d.intent.matches.map((m, i) => (
                                <span key={i} style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                                    background: 'rgba(239,68,68,.1)', color: '#f87171',
                                    fontSize: 11, fontWeight: 600, marginLeft: 4, marginBottom: 4
                                }}>
                                    {m}
                                </span>
                            ))}
                        </div>
                    )}
                    {d.intent.intent === 'CHEATING' && (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: 8,
                            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.15)',
                            fontSize: 12, color: '#fca5a5'
                        }}>
                            ⚡ <strong>Cheating Detected:</strong> The student's speech contains keywords strongly indicating they were seeking answers or assistance from others.
                        </div>
                    )}
                    {d.intent.intent === 'SUSPICIOUS' && (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: 8,
                            background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.15)',
                            fontSize: 12, color: '#fde68a'
                        }}>
                            🔍 <strong>Suspicious Activity:</strong> The student may have been looking for hints or external assistance.
                        </div>
                    )}
                    {d.intent.intent === 'NORMAL' && (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: 8,
                            background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.15)',
                            fontSize: 12, color: '#86efac'
                        }}>
                            ✅ <strong>Normal:</strong> No suspicious intent detected in this speech segment.
                        </div>
                    )}
                </div>
            )}

            {d.confidence != null && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
                    Speech-to-Text confidence: {typeof d.confidence === 'number' ? `${(d.confidence * 100).toFixed(0)}%` : d.confidence}
                </div>
            )}
        </div>
    );
}

function TimelineItem({ event }) {
    const d = event.data || {};
    const icons = { violation: '⚠️', no_face: '👤', transcript: '🎙️' };
    const colors = { violation: '#ef4444', no_face: '#f59e0b', transcript: '#8b5cf6' };
    const c = colors[event.event_type] || '#6b7280';
    return (
        <div style={{ position: 'relative', paddingBottom: 20, paddingLeft: 24 }}>
            {/* Dot */}
            <div style={{
                position: 'absolute', left: -6, top: 4, width: 14, height: 14,
                borderRadius: '50%', background: c, border: '2px solid var(--bg-card, #1f2937)',
                boxShadow: `0 0 8px ${c}44`
            }} />
            <div style={{
                padding: '12px 16px', borderRadius: 12,
                background: `${c}08`, border: `1px solid ${c}18`
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {icons[event.event_type] || '📌'} {(d.alert_type || event.event_type || '').replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{fmtTime(event.timestamp)}</span>
                </div>
                {d.message_en && <div style={{ fontSize: 12, color: '#94a3b8' }}>{d.message_en}</div>}
                {d.transcript && <div style={{ fontSize: 12, color: '#c4b5fd', marginTop: 4 }}>"{d.transcript}"</div>}
                {d.intent && (
                    <div style={{ marginTop: 6 }}>
                        {intentBadge(d.intent.intent)}
                    </div>
                )}
            </div>
        </div>
    );
}


/* ═══════════════════════════  MAIN PAGE  ═══════════════════════════════════ */

export default function ExamAnalysisPage() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState(null);
    const [search, setSearch] = useState('');

    const fetchSessions = useCallback(() => {
        setLoading(true);
        fetch(`${API}/exam-sessions`)
            .then(r => r.json())
            .then(d => { setSessions(d.sessions || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    /* Migrate localStorage data as a demo session if no sessions exist */
    useEffect(() => {
        if (!loading && sessions.length === 0) {
            try {
                const quiz = JSON.parse(localStorage.getItem('lastQuizResult') || 'null');
                const violations = JSON.parse(localStorage.getItem('violationHistory') || '[]');
                const transcripts = JSON.parse(localStorage.getItem('audioTranscripts') || '[]');

                if (quiz || violations.length > 0 || transcripts.length > 0) {
                    const user = JSON.parse(localStorage.getItem('user') || 'null');
                    const studentName = user?.username || 'Current Student';

                    const events = [];
                    (violations || []).forEach(v => {
                        const evType = v.alert_type === 'NO_FACE' ? 'no_face' : 'violation';
                        events.push({
                            event_type: evType,
                            timestamp: v.timestamp || new Date().toISOString(),
                            data: v
                        });
                    });
                    (transcripts || []).forEach(t => {
                        events.push({
                            event_type: 'transcript',
                            timestamp: t.timestamp || new Date().toISOString(),
                            data: t
                        });
                    });

                    fetch(`${API}/exam-sessions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            student: studentName,
                            exam_topic: quiz?.topic || 'General',
                            score: quiz?.score ?? null,
                            total: quiz?.total ?? null,
                            percentage: quiz?.percentage ?? null,
                            grade: quiz ? gradeFromPercentage(quiz.percentage) : null,
                            events
                        })
                    }).then(() => fetchSessions()).catch(() => { });
                }
            } catch { }
        }
    }, [loading, sessions.length, fetchSessions]);

    const clearAll = async () => {
        if (!confirm('Delete ALL exam session data?')) return;
        await fetch(`${API}/exam-sessions`, { method: 'DELETE' });
        localStorage.removeItem('lastQuizResult');
        localStorage.removeItem('violationHistory');
        localStorage.removeItem('audioTranscripts');
        setSessions([]);
    };

    const filtered = sessions.filter(s =>
        s.student?.toLowerCase().includes(search.toLowerCase()) ||
        s.exam_topic?.toLowerCase().includes(search.toLowerCase())
    );

    const totalViolations = sessions.reduce((a, s) => a + (s.violation_count || 0), 0);
    const totalNoFace = sessions.reduce((a, s) => a + (s.no_face_count || 0), 0);
    const avgScore = sessions.filter(s => s.percentage != null).length > 0
        ? Math.round(sessions.filter(s => s.percentage != null).reduce((a, s) => a + s.percentage, 0) / sessions.filter(s => s.percentage != null).length)
        : null;

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
            {/* ─── Page Header ─── */}
            <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h1 style={{
                            fontSize: 32, fontWeight: 900, margin: 0,
                            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                        }}>
                            📋 Exam Analysis
                        </h1>
                        <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 6 }}>
                            Student-by-student proctoring analysis — click any student to view detailed violations, speech transcripts, and intent analysis
                        </p>
                    </div>
                    <button onClick={clearAll} style={{
                        padding: '10px 20px', borderRadius: 12,
                        background: 'linear-gradient(135deg, rgba(239,68,68,.12), rgba(239,68,68,.06))',
                        border: '1px solid rgba(239,68,68,.2)', color: '#f87171',
                        cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all .2s'
                    }}
                        onMouseEnter={e => { e.target.style.background = 'rgba(239,68,68,.2)' }}
                        onMouseLeave={e => { e.target.style.background = 'linear-gradient(135deg, rgba(239,68,68,.12), rgba(239,68,68,.06))' }}
                    >
                        🗑️ Clear All Data
                    </button>
                </div>

                {/* Summary Stats */}
                <div style={{ display: 'flex', gap: 16, marginTop: 24, flexWrap: 'wrap' }}>
                    <StatCard icon="👥" label="Total Students" value={sessions.length} />
                    <StatCard icon="⚠️" label="Total Violations" value={totalViolations} color="#ef4444" />
                    <StatCard icon="👤" label="No-Face Events" value={totalNoFace} color="#f59e0b" />
                    <StatCard icon="📊" label="Avg Score" value={avgScore != null ? `${avgScore}%` : '—'} color="#22c55e" />
                </div>
            </div>

            {/* ─── Search Bar ─── */}
            <div style={{ marginBottom: 20 }}>
                <div style={{
                    position: 'relative', maxWidth: 400
                }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#64748b' }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search students or topics..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '12px 16px 12px 42px', borderRadius: 14,
                            border: '1px solid rgba(255,255,255,.1)',
                            background: 'rgba(255,255,255,.04)',
                            color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                            transition: 'border-color .2s'
                        }}
                        onFocus={e => e.target.style.borderColor = '#06b6d4'}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.1)'}
                    />
                </div>
            </div>

            {/* ─── Students Table ─── */}
            <div style={{
                borderRadius: 20, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,.06)',
                background: 'var(--bg-card, #1f2937)',
                boxShadow: '0 4px 24px rgba(0,0,0,.15)'
            }}>
                {/* Table Header */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 0.8fr 0.8fr 0.8fr 0.8fr 0.6fr',
                    padding: '14px 24px',
                    background: 'rgba(0,0,0,.15)',
                    borderBottom: '1px solid rgba(255,255,255,.06)',
                    fontSize: 11, fontWeight: 700, color: '#64748b',
                    letterSpacing: .8, textTransform: 'uppercase'
                }}>
                    <span>Student</span>
                    <span>Exam Topic</span>
                    <span style={{ textAlign: 'center' }}>Score</span>
                    <span style={{ textAlign: 'center' }}>Grade</span>
                    <span style={{ textAlign: 'center' }}>Violations</span>
                    <span style={{ textAlign: 'center' }}>No Face</span>
                    <span style={{ textAlign: 'center' }}>View</span>
                </div>

                {/* Table Body */}
                {loading ? (
                    <div style={{ padding: '60px 24px', textAlign: 'center', color: '#94a3b8' }}>
                        <div className="animate-pulse" style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                        Loading student data...
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '60px 24px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: 56, marginBottom: 12, opacity: .5 }}>📭</div>
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No Students Found</div>
                        <div style={{ fontSize: 13, opacity: .7 }}>
                            {sessions.length === 0
                                ? 'Complete a quiz with proctoring enabled to see results here'
                                : 'No matches for your search'}
                        </div>
                    </div>
                ) : (
                    filtered.map((s, idx) => (
                        <div
                            key={s.id}
                            onClick={() => setSelectedSession(s)}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1.5fr 0.8fr 0.8fr 0.8fr 0.8fr 0.6fr',
                                padding: '16px 24px',
                                alignItems: 'center',
                                borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                                cursor: 'pointer',
                                transition: 'all .2s',
                                background: 'transparent'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(6,182,212,.04)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            {/* Student Name */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 38, height: 38, borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][idx % 5]}, ${['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4'][idx % 5]})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0
                                }}>
                                    {(s.student || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{s.student}</div>
                                    <div style={{ fontSize: 11, color: '#64748b' }}>{fmtTime(s.started_at)}</div>
                                </div>
                            </div>

                            {/* Topic */}
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>
                                {s.exam_topic || '—'}
                            </div>

                            {/* Score */}
                            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {s.percentage != null ? `${s.percentage}%` : '—'}
                            </div>

                            {/* Grade */}
                            <div style={{ textAlign: 'center' }}>
                                {s.grade ? (
                                    <span style={{
                                        display: 'inline-block', padding: '4px 14px', borderRadius: 10,
                                        fontSize: 13, fontWeight: 800,
                                        background: `${gradeColor(s.grade)}18`, color: gradeColor(s.grade),
                                        border: `1px solid ${gradeColor(s.grade)}30`
                                    }}>
                                        {s.grade}
                                    </span>
                                ) : '—'}
                            </div>

                            {/* Violations */}
                            <div style={{ textAlign: 'center' }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '4px 12px', borderRadius: 10,
                                    fontSize: 13, fontWeight: 700,
                                    background: (s.violation_count || 0) > 0 ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.08)',
                                    color: (s.violation_count || 0) > 0 ? '#f87171' : '#4ade80',
                                    border: `1px solid ${(s.violation_count || 0) > 0 ? 'rgba(239,68,68,.18)' : 'rgba(34,197,94,.15)'}`
                                }}>
                                    {(s.violation_count || 0) > 0 ? '⚠️' : '✅'} {s.violation_count || 0}
                                </span>
                            </div>

                            {/* No Face */}
                            <div style={{ textAlign: 'center' }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '4px 12px', borderRadius: 10,
                                    fontSize: 13, fontWeight: 700,
                                    background: (s.no_face_count || 0) > 0 ? 'rgba(249,115,22,.1)' : 'rgba(34,197,94,.08)',
                                    color: (s.no_face_count || 0) > 0 ? '#fb923c' : '#4ade80',
                                    border: `1px solid ${(s.no_face_count || 0) > 0 ? 'rgba(249,115,22,.18)' : 'rgba(34,197,94,.15)'}`
                                }}>
                                    {s.no_face_count || 0}
                                </span>
                            </div>

                            {/* View Button */}
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: 10,
                                    background: 'rgba(6,182,212,.1)', border: '1px solid rgba(6,182,212,.18)',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, cursor: 'pointer', transition: 'all .2s'
                                }}
                                    onMouseEnter={e => { e.target.style.background = 'rgba(6,182,212,.2)' }}
                                    onMouseLeave={e => { e.target.style.background = 'rgba(6,182,212,.1)' }}
                                >
                                    👁️
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {selectedSession && (
                <StudentDetailModal
                    session={selectedSession}
                    onClose={() => setSelectedSession(null)}
                />
            )}
        </div>
    );
}
