import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api';

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
        return null;
    }
}

function formatDate(value) {
    if (!value) return 'Not available';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return 'Not available';
    }
}

function formatSeconds(value) {
    const seconds = Number(value || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function HomePage() {
    const [isVisible, setIsVisible] = useState(false);
    const [role, setRole] = useState('student');
    const [user, setUser] = useState(null);
    const [galleryItems, setGalleryItems] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
    const [adminError, setAdminError] = useState('');

    useEffect(() => {
        setIsVisible(true);
        const activeUser = getCurrentUser();
        setUser(activeUser);
        setRole(activeUser?.role || localStorage.getItem('userRole') || 'student');
    }, []);

    useEffect(() => {
        if (role !== 'admin') return undefined;

        let cancelled = false;

        async function loadAdminHome() {
            setIsLoadingAdmin(true);
            try {
                const [gallery, templatePayload, examPayload] = await Promise.all([
                    apiFetch('/api/gallery'),
                    apiFetch('/api/templates'),
                    fetch('http://localhost:8000/exam-sessions').then((response) => response.json()),
                ]);

                if (cancelled) return;

                setGalleryItems(gallery.items || []);
                setTemplates(templatePayload.templates || []);
                setSessions(examPayload.sessions || []);
                setAdminError('');
            } catch (error) {
                if (!cancelled) {
                    setAdminError(error.message || 'Unable to load admin overview');
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingAdmin(false);
                }
            }
        }

        void loadAdminHome();

        return () => {
            cancelled = true;
        };
    }, [role]);

    const studentFeatures = [
        {
            icon: '📝',
            title: 'AI Proctoring Quiz System',
            description: 'Advanced AI-powered examination monitoring with real-time webcam tracking, violation detection, and automated alerts.',
            gradient: 'from-cyan-500 to-blue-500',
            link: '/quiz',
            stats: { label: 'Active Monitoring', value: '99.9%' }
        },
        {
            icon: '📊',
            title: 'MCQ & Diagram Practice',
            description: 'Practice MCQ questions, upload diagram answers, and receive automated scoring with feedback reports.',
            gradient: 'from-emerald-500 to-teal-500',
            link: '/mcq-diagrams',
            stats: { label: 'Practice Mode', value: 'Ready' }
        },
        {
            icon: '🎙️',
            title: 'Voice Answer Platform',
            description: 'Answer short questions using your voice with focused feedback on marks, topic gaps, and speaking confidence.',
            gradient: 'from-fuchsia-500 to-pink-500',
            link: '/voice-quiz',
            stats: { label: 'Voice Feedback', value: 'AI Assisted' }
        },
        {
            icon: '🎬',
            title: 'Smart Lecture Cleaner',
            description: 'Upload lecture recordings, remove buffering and low-value segments, and generate cleaner outputs with downloadable reports.',
            gradient: 'from-amber-500 to-orange-500',
            link: '/video-cleaner',
            stats: { label: 'Video Processing', value: 'Ready' }
        }
    ];

    const studentQuickActions = [
        {
            icon: '📝',
            eyebrow: 'Exam Proctoring',
            title: 'Start Quiz',
            link: '/quiz',
            gradient: 'from-cyan-500 to-blue-500',
            shadow: 'shadow-cyan-500/40 hover:shadow-cyan-500/60'
        },
        {
            icon: '📊',
            eyebrow: 'Practice Studio',
            title: 'MCQ & Diagrams',
            link: '/mcq-diagrams',
            gradient: 'from-emerald-500 to-teal-500',
            shadow: 'shadow-emerald-500/30 hover:shadow-emerald-500/50'
        },
        {
            icon: '🎙️',
            eyebrow: 'Voice Evaluation',
            title: 'Answer using Voice',
            link: '/voice-quiz',
            gradient: 'from-fuchsia-500 to-pink-500',
            shadow: 'shadow-fuchsia-500/30 hover:shadow-fuchsia-500/50'
        },
        {
            icon: '🎬',
            eyebrow: 'Lecture Tools',
            title: 'Smart Cleaner',
            link: '/video-cleaner',
            gradient: 'from-amber-500 to-orange-500',
            shadow: 'shadow-amber-500/30 hover:shadow-amber-500/50'
        }
    ];

    const studentHighlights = [
        {
            icon: '✦',
            label: 'AI-Powered',
            value: 'Advanced ML Models',
            accent: 'from-cyan-500/20 to-blue-500/20',
            iconColor: 'text-cyan-300'
        },
        {
            icon: '⚡',
            label: 'Real-time',
            value: 'Instant Processing',
            accent: 'from-emerald-500/20 to-teal-500/20',
            iconColor: 'text-emerald-300'
        },
        {
            icon: '🔒',
            label: 'Secure',
            value: 'Privacy First',
            accent: 'from-violet-500/20 to-fuchsia-500/20',
            iconColor: 'text-violet-300'
        },
        {
            icon: '🌐',
            label: 'Bilingual',
            value: 'English & Sinhala',
            accent: 'from-amber-500/20 to-orange-500/20',
            iconColor: 'text-amber-300'
        }
    ];

    const adminStats = useMemo(() => {
        const cleanedLectures = galleryItems.length;
        const totalDuration = galleryItems.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0);
        const totalRemoved = galleryItems.reduce((sum, item) => sum + Number(item.total_removed_seconds || 0), 0);
        const totalViolations = sessions.reduce((sum, item) => sum + Number(item.violation_count || 0), 0);

        return [
            { label: 'Exam Sessions', value: String(sessions.length), note: 'Tracked student attempts' },
            { label: 'Violations', value: String(totalViolations), note: 'Recorded across monitored exams' },
            { label: 'Cleaned Lectures', value: String(cleanedLectures), note: `${templates.length} template${templates.length === 1 ? '' : 's'} ready` },
            { label: 'Removed Time', value: formatSeconds(totalRemoved), note: `${formatSeconds(totalDuration)} processed in total` },
        ];
    }, [galleryItems, sessions, templates]);

    const adminActions = [
        {
            title: 'Exam Analysis',
            description: 'Review violations, transcripts, and suspicious intent across student sessions.',
            to: '/analysis',
            badge: 'Proctoring',
            icon: '📈',
            tone: 'from-cyan-500 to-blue-500',
        },
        {
            title: 'Smart Cleaner',
            description: 'Monitor lecture jobs, summaries, cleaned video outputs, and admin tools.',
            to: '/video-cleaner',
            badge: 'Lecture Ops',
            icon: '🎬',
            tone: 'from-violet-500 to-fuchsia-500',
        },
        {
            title: 'Attendance Tools',
            description: 'Open classroom counters and smart attenders from the admin workspace.',
            to: '/attendance-counter',
            badge: 'Classroom',
            icon: '🙋',
            tone: 'from-emerald-500 to-teal-500',
        },
        {
            title: 'Admin Dashboard',
            description: 'Open the dedicated operations dashboard with cleaner metrics and recent lecture activity.',
            to: '/admin',
            badge: 'Operations',
            icon: '🧭',
            tone: 'from-amber-500 to-orange-500',
        },
    ];

    const recentSessions = useMemo(
        () => [...sessions]
            .sort((a, b) => new Date(b.started_at || b.created_at || 0) - new Date(a.started_at || a.created_at || 0))
            .slice(0, 4),
        [sessions]
    );

    const recentLectures = galleryItems.slice(0, 3);

    if (role === 'admin') {
        return (
            <div className="min-h-screen bg-slate-950 text-white">
                <section className="relative overflow-hidden border-b border-white/5">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.18),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.92),_rgba(2,6,23,1))]" />
                    <div className="relative mx-auto max-w-7xl px-6 py-10 sm:py-14">
                        <div className={`grid gap-6 transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} lg:grid-cols-[1.2fr_0.8fr]`}>
                            <div className="space-y-5">
                                <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                                    Admin Home
                                </div>
                                <div>
                                    <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                                        Control the platform from one admin workspace
                                    </h1>
                                    <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                                        Review proctoring activity, watch lecture-cleaning throughput, and move directly into the tools that need action.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <Link to="/analysis" className="inline-flex h-12 items-center justify-center rounded-xl bg-cyan-500 px-5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400">
                                        Open Exam Analysis
                                    </Link>
                                    <Link to="/video-cleaner" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold text-white transition hover:border-cyan-300/40 hover:bg-white/10">
                                        Manage Smart Cleaner
                                    </Link>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                {adminStats.map((item) => (
                                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                                        <div className="text-sm font-semibold text-slate-300">{item.label}</div>
                                        <div className="mt-3 text-3xl font-extrabold">{item.value}</div>
                                        <div className="mt-2 text-sm leading-6 text-slate-400">{item.note}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-6 py-8">
                    {adminError ? (
                        <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200">
                            {adminError}
                        </div>
                    ) : null}

                    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-6">
                            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                                <div className="mb-4 flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-extrabold">Admin Shortcuts</h2>
                                        <p className="mt-1 text-sm text-slate-400">Direct entry points for the areas that need supervision.</p>
                                    </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {adminActions.map((item) => (
                                        <Link
                                            key={item.to}
                                            to={item.to}
                                            className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 transition hover:border-white/20 hover:bg-slate-900"
                                        >
                                            <div className={`h-1.5 w-full bg-gradient-to-r ${item.tone}`} />
                                            <div className="p-5">
                                                <div className="flex items-start gap-4">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-2xl">
                                                        {item.icon}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                                            {item.badge}
                                                        </div>
                                                        <div className="mt-2 text-lg font-extrabold">{item.title}</div>
                                                        <div className="mt-2 text-sm leading-6 text-slate-400">{item.description}</div>
                                                        <div className="mt-4 text-sm font-bold text-cyan-300 transition group-hover:translate-x-1">
                                                            Open →
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                                <div className="mb-4 flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-extrabold">Recent Exam Sessions</h2>
                                        <p className="mt-1 text-sm text-slate-400">Latest monitored activity from student exams.</p>
                                    </div>
                                    <Link to="/analysis" className="text-sm font-bold text-cyan-300">
                                        View all
                                    </Link>
                                </div>

                                <div className="space-y-3">
                                    {isLoadingAdmin ? (
                                        <AdminListCard title="Loading exam activity..." />
                                    ) : recentSessions.length === 0 ? (
                                        <AdminListCard title="No exam sessions yet" meta="Exam sessions will appear here once students start monitored quizzes." />
                                    ) : (
                                        recentSessions.map((session) => (
                                            <div key={session.session_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-base font-extrabold">{session.student || 'Unknown student'}</div>
                                                        <div className="mt-1 text-sm text-slate-400">{session.exam_topic || 'General'}</div>
                                                    </div>
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
                                                        {Number(session.violation_count || 0)} violations
                                                    </span>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                                                    <span>Score: <strong className="text-slate-200">{session.score ?? '-'} / {session.total ?? '-'}</strong></span>
                                                    <span>Started: <strong className="text-slate-200">{formatDate(session.started_at || session.created_at)}</strong></span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="space-y-6">
                            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                                <div className="mb-4 flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-extrabold">Lecture Processing</h2>
                                        <p className="mt-1 text-sm text-slate-400">Most recent cleaned lecture outputs.</p>
                                    </div>
                                    <Link to="/video-cleaner" className="text-sm font-bold text-cyan-300">
                                        Open
                                    </Link>
                                </div>

                                <div className="space-y-3">
                                    {isLoadingAdmin ? (
                                        <AdminListCard title="Loading lecture data..." />
                                    ) : recentLectures.length === 0 ? (
                                        <AdminListCard title="No cleaned lectures yet" meta="Cleaner outputs will appear here after processing." />
                                    ) : (
                                        recentLectures.map((item) => (
                                            <Link
                                                key={item.job_id}
                                                to={`/video-cleaner/jobs/${item.job_id}`}
                                                className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-base font-extrabold">{item.title}</div>
                                                        <div className="mt-1 text-sm text-slate-400">{formatDate(item.created_at)}</div>
                                                    </div>
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
                                                        {item.summary_pdf_url ? 'PDF' : 'Video'}
                                                    </span>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                                                    <span>Duration: <strong className="text-slate-200">{formatSeconds(item.duration_seconds)}</strong></span>
                                                    <span>Removed: <strong className="text-slate-200">{formatSeconds(item.total_removed_seconds)}</strong></span>
                                                </div>
                                            </Link>
                                        ))
                                    )}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                                <h2 className="text-xl font-extrabold">Admin Identity</h2>
                                <div className="mt-4 space-y-3 text-sm">
                                    <AdminInfoRow label="Username" value={user?.username || 'admin'} />
                                    <AdminInfoRow label="Role" value={role} />
                                    <AdminInfoRow label="Templates Ready" value={String(templates.length)} />
                                    <AdminInfoRow label="Summary PDFs" value={String(galleryItems.filter((item) => item.summary_pdf_url).length)} />
                                </div>
                            </section>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black transition-colors duration-300">
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-500/30 blur-3xl animate-pulse dark:from-cyan-500/20 dark:to-blue-600/20"></div>
                    <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-gradient-to-br from-purple-400/30 to-pink-500/30 blur-3xl animate-pulse delay-1000 dark:from-purple-500/20 dark:to-pink-600/20"></div>
                </div>

                <div className={`relative mx-auto max-w-7xl px-6 py-24 transition-all duration-1000 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                    <div className="space-y-8 text-center">
                        <div className="space-y-4">
                            <div className="inline-block">
                                <span className="inline-block text-6xl sm:text-7xl">🎓</span>
                            </div>
                            <h1 className="text-4xl font-extrabold sm:text-5xl md:text-6xl">
                                <span className="bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                                    AI Proctoring & Learning
                                </span>
                            </h1>
                            <p className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
                                Next-Generation Education Platform
                            </p>
                        </div>

                        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">
                            Experience the future of education with AI-powered proctoring, MCQ practice,
                            diagram-based learning, and lecture video cleaning - all in one comprehensive platform.
                        </p>

                        <div className="grid w-full max-w-6xl grid-cols-1 gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-4">
                            {studentQuickActions.map((action) => (
                                <Link
                                    key={action.link}
                                    to={action.link}
                                    className={`group relative overflow-hidden rounded-2xl bg-gradient-to-r ${action.gradient} p-[1px] text-left shadow-lg transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] ${action.shadow}`}
                                >
                                    <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                    <div className="relative flex h-full items-center gap-4 rounded-2xl bg-slate-900/10 px-5 py-4 backdrop-blur-sm">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/18 text-2xl shadow-inner shadow-white/10">
                                            {action.icon}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                                                {action.eyebrow}
                                            </div>
                                            <div className="mt-1 text-lg font-bold leading-tight text-white">
                                                {action.title}
                                            </div>
                                        </div>
                                        <div className="text-xl font-bold text-white transition-transform duration-300 group-hover:translate-x-1">
                                            →
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 pt-8 md:grid-cols-4">
                            {studentHighlights.map((item) => (
                                <div
                                    key={item.label}
                                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/6 p-5 text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl hover:shadow-cyan-500/10 dark:bg-white/5"
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}></div>
                                    <div className="relative">
                                        <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gray-900/40 text-2xl shadow-inner ${item.iconColor}`}>
                                            {item.icon}
                                        </div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                                            {item.label}
                                        </div>
                                        <div className="mt-2 text-lg font-bold leading-tight text-gray-900 dark:text-white sm:text-xl">
                                            {item.value}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-20">
                <div className="mb-12 text-center">
                    <h2 className="mb-3 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Powerful Features</h2>
                    <p className="text-base text-gray-600 dark:text-gray-400 sm:text-lg">Everything you need for modern education management</p>
                </div>

                <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
                    {studentFeatures.map((feature) => (
                        <div key={feature.title} className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:border-transparent dark:border-gray-700 dark:bg-gray-800">
                            <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}></div>
                            <div className="relative m-[2px] h-full rounded-3xl bg-white p-8 dark:bg-gray-800">
                                <div className={`mb-4 inline-block rounded-2xl bg-gradient-to-br ${feature.gradient} bg-opacity-10 p-4 text-6xl`}>{feature.icon}</div>
                                <h3 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">{feature.title}</h3>
                                <p className="mb-6 leading-relaxed text-gray-600 dark:text-gray-400">{feature.description}</p>
                                <div className={`mb-6 inline-block rounded-xl bg-gradient-to-r ${feature.gradient} bg-opacity-10 px-4 py-2`}>
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{feature.stats.label}: {feature.stats.value}</span>
                                </div>
                                <Link to={feature.link} className={`inline-flex items-center gap-2 bg-gradient-to-r ${feature.gradient} bg-clip-text font-bold text-transparent transition-all duration-300 group-hover:gap-3`}>
                                    Explore Now
                                    <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function AdminInfoRow({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-slate-400">{label}</span>
            <span className="truncate text-right font-bold text-white">{value}</span>
        </div>
    );
}

function AdminListCard({ title, meta = '' }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-base font-extrabold">{title}</div>
            {meta ? <div className="mt-1 text-sm text-slate-400">{meta}</div> : null}
        </div>
    );
}

export default HomePage;
