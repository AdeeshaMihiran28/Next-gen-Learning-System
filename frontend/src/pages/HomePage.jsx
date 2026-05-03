import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

function HomePage() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    const features = [
        {
            icon: '??',
            title: 'AI Proctoring Quiz System',
            description: 'Advanced AI-powered examination monitoring with real-time webcam tracking, violation detection, and automated alerts.',
            gradient: 'from-cyan-500 to-blue-500',
            link: '/quiz',
            stats: { label: 'Active Monitoring', value: '99.9%' }
        },
        {
            icon: '\u{1F4CA}',
            title: 'MCQ & Diagram Practice',
            description: 'Practice MCQ questions, upload diagram answers, and receive automated scoring with feedback reports.',
            gradient: 'from-emerald-500 to-teal-500',
            link: '/mcq-diagrams',
            stats: { label: 'Practice Mode', value: 'Ready' }
        },
        {
            icon: '\u{1F399}\uFE0F',
            title: 'Voice Answer Platform',
            description: 'Answer short questions using your voice with focused feedback on marks, topic gaps, and speaking confidence.',
            gradient: 'from-fuchsia-500 to-pink-500',
            link: '/voice-quiz',
            stats: { label: 'Voice Feedback', value: 'AI Assisted' }
        },
        {
            icon: '\u{1F3AC}',
            title: 'Smart Lecture Cleaner',
            description: 'Upload lecture recordings, remove buffering and low-value segments, and generate cleaner outputs with downloadable reports.',
            gradient: 'from-amber-500 to-orange-500',
            link: '/video-cleaner',
            stats: { label: 'Video Processing', value: 'Ready' }
        }
    ];

    const quickActions = [
        {
            icon: '\u{1F4DD}',
            eyebrow: 'Exam Proctoring',
            title: 'Start Quiz',
            link: '/quiz',
            gradient: 'from-cyan-500 to-blue-500',
            shadow: 'shadow-cyan-500/40 hover:shadow-cyan-500/60'
        },
        {
            icon: '\u{1F4CA}',
            eyebrow: 'Practice Studio',
            title: 'MCQ & Diagrams',
            link: '/mcq-diagrams',
            gradient: 'from-emerald-500 to-teal-500',
            shadow: 'shadow-emerald-500/30 hover:shadow-emerald-500/50'
        },
        {
            icon: '\u{1F399}\uFE0F',
            eyebrow: 'Voice Evaluation',
            title: 'Answer using Voice',
            link: '/voice-quiz',
            gradient: 'from-fuchsia-500 to-pink-500',
            shadow: 'shadow-fuchsia-500/30 hover:shadow-fuchsia-500/50'
        },
        {
            icon: '\u{1F3AC}',
            eyebrow: 'Lecture Tools',
            title: 'Smart Cleaner',
            link: '/video-cleaner',
            gradient: 'from-amber-500 to-orange-500',
            shadow: 'shadow-amber-500/30 hover:shadow-amber-500/50'
        }
    ];

    const highlights = [
        {
            icon: '\u{2726}',
            label: 'AI-Powered',
            value: 'Advanced ML Models',
            accent: 'from-cyan-500/20 to-blue-500/20',
            iconColor: 'text-cyan-300'
        },
        {
            icon: '\u{26A1}',
            label: 'Real-time',
            value: 'Instant Processing',
            accent: 'from-emerald-500/20 to-teal-500/20',
            iconColor: 'text-emerald-300'
        },
        {
            icon: '\u{1F512}',
            label: 'Secure',
            value: 'Privacy First',
            accent: 'from-violet-500/20 to-fuchsia-500/20',
            iconColor: 'text-violet-300'
        },
        {
            icon: '\u{1F310}',
            label: 'Bilingual',
            value: 'English & Sinhala',
            accent: 'from-amber-500/20 to-orange-500/20',
            iconColor: 'text-amber-300'
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black transition-colors duration-300">
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-blue-500/30 dark:from-cyan-500/20 dark:to-blue-600/20 rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-500/30 dark:from-purple-500/20 dark:to-pink-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
                </div>

                <div className={`relative px-6 py-24 max-w-7xl mx-auto transition-all duration-1000 transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                    <div className="text-center space-y-8">
                        <div className="space-y-4">
                            <div className="inline-block">
                                <span className="text-6xl sm:text-7xl animate-bounce inline-block">??</span>
                            </div>
                            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold">
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 animate-gradient">
                                    AI Proctoring & Learning
                                </span>
                            </h1>
                            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                                Next-Generation Education Platform
                            </p>
                        </div>

                        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
                            Experience the future of education with AI-powered proctoring, MCQ practice,
                            diagram-based learning, and lecture video cleaning - all in one comprehensive platform.
                        </p>

                        <div className="grid w-full max-w-6xl grid-cols-1 gap-4 pt-6 sm:grid-cols-2 xl:grid-cols-4">
                            {quickActions.map((action) => (
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
                                            &rarr;
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 max-w-5xl mx-auto">
                            {highlights.map((item, index) => (
                                <div
                                    key={index}
                                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/6 dark:bg-white/5 backdrop-blur-xl p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl hover:shadow-cyan-500/10"
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}></div>
                                    <div className="relative">
                                        <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gray-900/40 text-2xl shadow-inner ${item.iconColor}`}>
                                            {item.icon}
                                        </div>
                                        <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-gray-400 dark:text-gray-500">
                                            {item.label}
                                        </div>
                                        <div className="mt-2 text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">
                                            {item.value}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="px-6 py-20 max-w-7xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">Powerful Features</h2>
                    <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">Everything you need for modern education management</p>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-8">
                    {features.map((feature, index) => (
                        <div key={index} className={`group relative overflow-hidden rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-transparent transition-all duration-500 hover:scale-105 hover:shadow-2xl ${isVisible ? `animate-slide-up delay-${index * 100}` : 'opacity-0'}`}>
                            <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                            <div className="relative bg-white dark:bg-gray-800 m-[2px] rounded-3xl p-8 h-full">
                                <div className={`text-6xl mb-4 inline-block p-4 rounded-2xl bg-gradient-to-br ${feature.gradient} bg-opacity-10`}>{feature.icon}</div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{feature.title}</h3>
                                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">{feature.description}</p>
                                <div className={`inline-block px-4 py-2 rounded-xl bg-gradient-to-r ${feature.gradient} bg-opacity-10 mb-6`}>
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{feature.stats.label}: {feature.stats.value}</span>
                                </div>
                                <Link to={feature.link} className={`inline-flex items-center gap-2 font-bold bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent group-hover:gap-3 transition-all duration-300`}>
                                    Explore Now
                                    <span className="transform group-hover:translate-x-1 transition-transform duration-300">?</span>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

export default HomePage;
