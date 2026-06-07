import { Link } from 'react-router-dom';

function Footer() {
    const currentYear = new Date().getFullYear();

    const footerLinks = [
        { label: 'Home', path: '/home' },
        { label: 'Live Quiz', path: '/quiz' },
        { label: 'Practice Lab', path: '/mcq-diagrams' },
        { label: 'Voice Lab', path: '/voice-quiz' },
        { label: 'Smart Cleaner', path: '/video-cleaner' },
    ];

    return (
        <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">
            <div className="mx-auto max-w-7xl px-6 py-10">
                <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_0.9fr_1fr]">
                    <div className="max-w-md">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 ring-1 ring-slate-800 text-xl">
                                {'\u{1F393}'}
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-white">
                                    AI Proctoring & Learning System
                                </h3>
                                <p className="text-sm text-slate-400">
                                    Exam integrity, guided practice, and lecture cleanup in one platform.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Navigation
                        </h4>
                        <div className="flex flex-col gap-2">
                            {footerLinks.map((link) => (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className="text-sm text-slate-400 transition-colors duration-200 hover:text-cyan-300"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Platform
                        </h4>
                        <div className="flex flex-col gap-2 text-sm text-slate-400">
                            <p>AI-powered proctoring</p>
                            <p>Real-time monitoring</p>
                            <p>Voice review workflows</p>
                            <p>Lecture cleanup tools</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Support
                        </h4>
                        <div className="flex flex-col gap-2 text-sm text-slate-400">
                            <a
                                href="mailto:support@aiproctoring.com"
                                className="transition-colors duration-200 hover:text-cyan-300"
                            >
                                support@aiproctoring.com
                            </a>
                            <p>Account access, quiz flow, voice review, and cleaner support.</p>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-2 border-t border-slate-800 pt-5 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
                    <p>&copy; {currentYear} AI Proctoring & Learning System. All rights reserved.</p>
                    <p>Built for modern education workflows.</p>
                </div>
            </div>
        </footer>
    );
}

export default Footer;
