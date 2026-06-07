import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/api';

const VOICE_DRAFT_KEY = 'voice_quiz_draft_v1';

function readJson(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function gradeFromPercentage(value) {
    const percentage = Number(value);
    if (!Number.isFinite(percentage)) return null;
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
}

function formatDate(value) {
    if (!value) return 'Not recorded';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return 'Not recorded';
    }
}

export default function StudentDashboard() {
    const [profile, setProfile] = useState(null);
    const [lastQuiz, setLastQuiz] = useState(null);
    const [violations, setViolations] = useState([]);
    const [transcripts, setTranscripts] = useState([]);
    const [voiceDraft, setVoiceDraft] = useState(null);
    const [practiceOverview, setPracticeOverview] = useState(null);
    const [practiceError, setPracticeError] = useState('');

    useEffect(() => {
        setProfile(readJson('user', null));
        setLastQuiz(readJson('lastQuizResult', null));
        setViolations(readJson('violationHistory', []));
        setTranscripts(readJson('audioTranscripts', []));
        setVoiceDraft(readJson(VOICE_DRAFT_KEY, null));
    }, []);

    useEffect(() => {
        if (!localStorage.getItem('token')) return;

        let cancelled = false;

        apiFetch('/api/mcq-diagram/overview')
            .then((data) => {
                if (!cancelled) {
                    setPracticeOverview(data);
                    setPracticeError('');
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setPracticeError(error.message || 'Practice progress unavailable');
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const dashboardStats = useMemo(() => {
        const percentage = Number(lastQuiz?.percentage);
        const scoreLabel = Number.isFinite(percentage) ? `${Math.round(percentage)}%` : 'No attempt';
        const grade = lastQuiz?.grade || gradeFromPercentage(percentage) || '-';
        const cheatingSpeech = transcripts.filter((entry) => entry?.intent?.intent === 'CHEATING').length;
        const suspiciousSpeech = transcripts.filter((entry) => entry?.intent?.intent === 'SUSPICIOUS').length;

        return [
            {
                label: 'Latest Score',
                value: scoreLabel,
                detail: grade !== '-' ? `Grade ${grade}` : 'Start a live quiz',
                color: 'from-emerald-500 to-teal-500',
            },
            {
                label: 'Exam Violations',
                value: String(violations.length),
                detail: violations.length > 0 ? 'Review your monitoring alerts' : 'No local violations',
                color: 'from-rose-500 to-red-500',
            },
            {
                label: 'Speech Checks',
                value: String(transcripts.length),
                detail: cheatingSpeech || suspiciousSpeech ? `${cheatingSpeech} cheating, ${suspiciousSpeech} suspicious` : 'No suspicious speech',
                color: 'from-violet-500 to-fuchsia-500',
            },
        ];
    }, [lastQuiz, transcripts, violations]);

    const quickActions = [
        {
            title: 'Live Quiz',
            description: 'Start a monitored exam with webcam and audio proctoring.',
            icon: '📝',
            to: '/quiz',
            action: 'Start',
        },
        {
            title: 'Practice Lab',
            description: 'Practice MCQs and diagram answers with automated feedback.',
            icon: '📊',
            to: '/mcq-diagrams',
            action: 'Practice',
        },
        {
            title: 'Voice Lab',
            description: 'Answer short questions using speech and review your confidence.',
            icon: '🎙️',
            to: '/voice-quiz',
            action: 'Record',
        },
        {
            title: 'Smart Cleaner',
            description: 'Upload lectures and generate cleaner video outputs.',
            icon: '🎬',
            to: '/video-cleaner',
            action: 'Open',
        },
    ];

    const recentItems = [
        {
            title: 'Last quiz attempt',
            value: lastQuiz ? `${lastQuiz.score ?? '-'} / ${lastQuiz.total ?? '-'}` : 'No quiz completed yet',
            meta: lastQuiz?.topic || 'Live Quiz',
        },
        {
            title: 'Current exam session',
            value: localStorage.getItem('currentExamSessionId') ? 'Session in progress' : 'No active session',
            meta: 'Proctoring state',
        },
        {
            title: 'Latest transcript',
            value: transcripts.at(-1)?.transcript || 'No speech transcript saved',
            meta: formatDate(transcripts.at(-1)?.timestamp),
        },
    ];

    const voiceAnswered = Array.isArray(voiceDraft?.answers)
        ? voiceDraft.answers.filter((answer) => answer?.transcript || answer?.grade).length
        : 0;
    const voiceTotal = Array.isArray(voiceDraft?.questions) ? voiceDraft.questions.length : 0;
    const voiceLastSaved = voiceDraft?.savedAt ? formatDate(voiceDraft.savedAt) : 'No draft saved';
    const voiceAverageConfidence = (() => {
        const values = (voiceDraft?.answers || [])
            .map((answer) => Number(answer?.voice_confidence))
            .filter((value) => Number.isFinite(value));
        if (!values.length) return '-';
        const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
        return `${Math.round(avg * 100)}%`;
    })();

    const practiceCounts = practiceOverview?.counts || {};
    const activeAttempt = practiceOverview?.active_attempt;
    const practiceStatus = activeAttempt
        ? activeAttempt.phase === 'mcq'
            ? 'MCQ in progress'
            : activeAttempt.phase === 'diagram'
                ? 'Diagram upload pending'
                : 'Completed'
        : practiceOverview
            ? 'Ready to start'
            : practiceError || 'Login required';

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 transition-colors duration-300 dark:bg-gray-950 dark:text-white sm:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-400">
                                Student Workspace
                            </p>
                            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                                Welcome, {profile?.fullName || profile?.username || 'Student'}
                            </h1>
                            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                                Track your latest quiz result, proctoring alerts, practice progress, and learning tools from one place.
                            </p>

                            <div className="mt-6 flex flex-wrap gap-3">
                                <Link
                                    to="/quiz"
                                    className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-500 px-5 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-600"
                                >
                                    Start Live Quiz
                                </Link>
                                <Link
                                    to="/mcq-diagrams"
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-gray-700 dark:bg-gray-950 dark:text-slate-200"
                                >
                                    Continue Practice
                                </Link>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-5 dark:border-cyan-900/50 dark:bg-cyan-950/30">
                            <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Account</div>
                            <div className="mt-4 space-y-3 text-sm">
                                <InfoRow label="Username" value={profile?.username || '-'} />
                                <InfoRow label="Role" value={profile?.role || localStorage.getItem('userRole') || 'student'} />
                                <InfoRow label="Email" value={profile?.email || '-'} />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                    {dashboardStats.map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                            <div className={`mb-4 h-1.5 w-20 rounded-full bg-gradient-to-r ${item.color}`} />
                            <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{item.label}</div>
                            <div className="mt-2 text-3xl font-extrabold">{item.value}</div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.detail}</div>
                        </div>
                    ))}
                </section>

                <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-5 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-extrabold">Learning Tools</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose your next activity.</p>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {quickActions.map((item) => (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-white hover:shadow-lg dark:border-gray-800 dark:bg-gray-950 dark:hover:border-cyan-800 dark:hover:bg-gray-900"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm dark:bg-gray-900">
                                            {item.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-extrabold">{item.title}</h3>
                                            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.description}</p>
                                            <div className="mt-3 text-sm font-bold text-cyan-600 dark:text-cyan-400">
                                                {item.action} <span className="transition group-hover:translate-x-1 inline-block">→</span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <h2 className="text-xl font-extrabold">Recent Activity</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Local activity from this browser.</p>

                        <div className="mt-5 space-y-3">
                            {recentItems.map((item) => (
                                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                                    <div className="text-sm font-bold text-slate-500 dark:text-slate-400">{item.title}</div>
                                    <div className="mt-1 line-clamp-2 text-base font-extrabold">{item.value}</div>
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.meta}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-600 dark:text-fuchsia-400">
                                    Voice Lab
                                </div>
                                <h2 className="mt-2 text-2xl font-extrabold">Spoken Answer Practice</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                    Continue voice questions, review saved speech progress, and improve answer confidence.
                                </p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-50 text-2xl dark:bg-fuchsia-950/40">
                                🎙️
                            </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <MiniMetric label="Draft Progress" value={voiceTotal ? `${voiceAnswered}/${voiceTotal}` : '0/0'} />
                            <MiniMetric label="Avg Confidence" value={voiceAverageConfidence} />
                            <MiniMetric label="Last Saved" value={voiceLastSaved} compact />
                        </div>

                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                            <div className="text-sm font-bold text-slate-600 dark:text-slate-300">Latest saved voice answer</div>
                            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {(voiceDraft?.answers || []).slice().reverse().find((answer) => answer?.transcript)?.transcript || 'No voice answer draft found on this browser.'}
                            </p>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                            <Link to="/voice-quiz" className="inline-flex h-11 items-center justify-center rounded-xl bg-fuchsia-600 px-5 text-sm font-bold text-white transition hover:bg-fuchsia-700">
                                {voiceDraft ? 'Resume Voice Lab' : 'Start Voice Lab'}
                            </Link>
                            <Link to="/voice-quiz-results" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 transition hover:border-fuchsia-300 hover:text-fuchsia-700 dark:border-gray-700 dark:text-slate-200">
                                View Results
                            </Link>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                                    Practice Lab
                                </div>
                                <h2 className="mt-2 text-2xl font-extrabold">MCQ & Diagram Practice</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                    Track assignment status, completed question pools, and diagram upload progress.
                                </p>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl dark:bg-emerald-950/40">
                                📊
                            </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <MiniMetric label="Status" value={practiceStatus} compact />
                            <MiniMetric label="MCQ Done" value={String(practiceCounts.mcq_completed ?? 0)} />
                            <MiniMetric label="Diagram Done" value={String(practiceCounts.diagram_completed ?? 0)} />
                        </div>

                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                            <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                {practiceOverview?.title || 'MCQ and Diagram Assignment'}
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-500 dark:text-slate-400">
                                <InfoLine label="Course" value={practiceOverview?.course || 'Information Technology'} />
                                <InfoLine label="Per attempt" value={`${practiceCounts.mcq_questions_per_attempt ?? 10} MCQ + ${practiceCounts.diagram_questions_per_attempt ?? 2} diagrams`} />
                                <InfoLine label="Deadline" value={practiceOverview?.deadline || '-'} />
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                            <Link to="/mcq-diagrams" className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700">
                                {activeAttempt ? 'Continue Practice' : 'Start Practice'}
                            </Link>
                            {practiceError ? (
                                <span className="inline-flex items-center text-sm font-semibold text-amber-600 dark:text-amber-400">
                                    {practiceError}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-white/70 px-3 py-2 dark:bg-gray-950/50">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="truncate text-right font-bold">{value}</span>
        </div>
    );
}

function MiniMetric({ label, value, compact = false }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">{label}</div>
            <div className={`mt-2 font-extrabold ${compact ? 'text-sm leading-6' : 'text-2xl'}`}>{value}</div>
        </div>
    );
}

function InfoLine({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <span className="text-right font-bold text-slate-700 dark:text-slate-200">{value}</span>
        </div>
    );
}
