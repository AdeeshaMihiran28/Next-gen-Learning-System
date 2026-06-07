import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/api';

function formatSeconds(value) {
    const seconds = Number(value || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return '0.00s';
    if (seconds < 60) return `${seconds.toFixed(2)}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function formatDate(value) {
    if (!value) return 'Not available';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return 'Not available';
    }
}

export default function AdminDashboard() {
    const [galleryItems, setGalleryItems] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [isLoadingCleaner, setIsLoadingCleaner] = useState(true);
    const [cleanerError, setCleanerError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function loadDashboard() {
            setIsLoadingCleaner(true);
            try {
                const [gallery, templatePayload] = await Promise.all([
                    apiFetch('/api/gallery'),
                    apiFetch('/api/templates'),
                ]);

                if (!cancelled) {
                    setGalleryItems(gallery.items || []);
                    setTemplates(templatePayload.templates || []);
                    setCleanerError('');
                }
            } catch (error) {
                if (!cancelled) {
                    setCleanerError(error.message || 'Unable to load cleaner data');
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingCleaner(false);
                }
            }
        }

        fetch('http://localhost:8000/exam-sessions')
            .then((response) => response.json())
            .then((payload) => {
                if (!cancelled) setSessions(payload.sessions || []);
            })
            .catch(() => {});

        void loadDashboard();

        return () => {
            cancelled = true;
        };
    }, []);

    const cleanerStats = useMemo(() => {
        const totalDuration = galleryItems.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0);
        const totalRemoved = galleryItems.reduce((sum, item) => sum + Number(item.total_removed_seconds || 0), 0);
        const summaryCount = galleryItems.filter((item) => item.summary_pdf_url).length;

        return [
            {
                label: 'Cleaned Lectures',
                value: String(galleryItems.length),
                detail: 'Saved videos in gallery',
                color: 'from-cyan-500 to-blue-500',
            },
            {
                label: 'Lecture Time',
                value: formatSeconds(totalDuration),
                detail: 'Total processed duration',
                color: 'from-emerald-500 to-teal-500',
            },
            {
                label: 'Removed Time',
                value: formatSeconds(totalRemoved),
                detail: 'Black, silence, freeze, buffering',
                color: 'from-amber-500 to-orange-500',
            },
            {
                label: 'Summary PDFs',
                value: String(summaryCount),
                detail: `${templates.length} buffering template${templates.length === 1 ? '' : 's'}`,
                color: 'from-violet-500 to-fuchsia-500',
            },
        ];
    }, [galleryItems, templates]);

    const latestLectures = galleryItems.slice(0, 4);
    const totalViolations = sessions.reduce((sum, session) => sum + Number(session.violation_count || 0), 0);

    const adminActions = [
        {
            title: 'Upload Lecture',
            description: 'Start a new cleaner job with templates and detection settings.',
            to: '/video-cleaner',
            icon: '🎬',
        },
        {
            title: 'Lecture Gallery',
            description: 'Review cleaned lectures, download outputs, and open job details.',
            to: '/video-cleaner/gallery',
            icon: '🗂️',
        },
        {
            title: 'Exam Analysis',
            description: 'Inspect student scores, violations, transcripts, and cheating intent.',
            to: '/analysis',
            icon: '📈',
        },
        {
            title: 'Smart Attenders',
            description: 'Manage attendance counters and classroom participation tools.',
            to: '/attendance-counter',
            icon: '🙋',
        },
    ];

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 transition-colors duration-300 dark:bg-gray-950 dark:text-white sm:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-400">
                                Admin Operations
                            </p>
                            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                                Lecture Video Cleaner Dashboard
                            </h1>
                            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                                Monitor cleaned lecture outputs, template readiness, summary coverage, and student exam activity from one admin workspace.
                            </p>
                            <div className="mt-6 flex flex-wrap gap-3">
                                <Link to="/video-cleaner" className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-500 px-5 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-600">
                                    Upload New Lecture
                                </Link>
                                <Link to="/video-cleaner/gallery" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-gray-700 dark:bg-gray-950 dark:text-slate-200">
                                    Open Gallery
                                </Link>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-5 dark:border-cyan-900/50 dark:bg-cyan-950/30">
                            <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Cleaner Health</div>
                            <div className="mt-4 space-y-3 text-sm">
                                <InfoRow label="Cleaner API" value={cleanerError ? 'Needs attention' : isLoadingCleaner ? 'Loading' : 'Online'} />
                                <InfoRow label="Templates" value={String(templates.length)} />
                                <InfoRow label="Exam violations" value={String(totalViolations)} />
                            </div>
                            {cleanerError ? (
                                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                                    {cleanerError}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {cleanerStats.map((item) => (
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
                                <h2 className="text-xl font-extrabold">Cleaner Workbench</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Admin actions for lecture cleaning and monitoring.</p>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {adminActions.map((item) => (
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
                                                Open <span className="inline-block transition group-hover:translate-x-1">→</span>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-extrabold">Latest Cleaned Lectures</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Most recent gallery outputs.</p>
                            </div>
                            <Link to="/video-cleaner/gallery" className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                                View all
                            </Link>
                        </div>

                        <div className="mt-5 space-y-3">
                            {isLoadingCleaner ? (
                                <LectureRow title="Loading cleaner data..." />
                            ) : latestLectures.length === 0 ? (
                                <LectureRow title="No cleaned lectures yet" meta="Upload and process a lecture to populate this dashboard." />
                            ) : (
                                latestLectures.map((item) => (
                                    <Link
                                        key={item.job_id}
                                        to={`/video-cleaner/jobs/${item.job_id}`}
                                        className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-cyan-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950 dark:hover:border-cyan-800"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-base font-extrabold">{item.title}</div>
                                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{formatDate(item.created_at)}</div>
                                            </div>
                                            <span className="shrink-0 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                                                {item.summary_pdf_url ? 'PDF' : 'Video'}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-500 dark:text-slate-400">
                                            <InfoLine label="Duration" value={formatSeconds(item.duration_seconds)} />
                                            <InfoLine label="Removed" value={formatSeconds(item.total_removed_seconds)} />
                                        </div>
                                    </Link>
                                ))
                            )}
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

function InfoLine({ label, value }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <span className="text-right font-bold text-slate-700 dark:text-slate-200">{value}</span>
        </div>
    );
}

function LectureRow({ title, meta = '' }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="text-base font-extrabold">{title}</div>
            {meta ? <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{meta}</div> : null}
        </div>
    );
}
