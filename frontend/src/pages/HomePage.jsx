import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

import { apiFetch } from "../utils/api";
import { clearToken } from "../utils/auth";

function HomePage() {
  const [isVisible, setIsVisible] = useState(false);
  const [me, setMe] = useState(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // ✅ Load logged-in user (if token exists)
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch("/api/auth/me");
        setMe(r.user);
      } catch (e) {
        clearToken();
        setMe(null);
      }
    })();
  }, []);

  const features = [
    {
      icon: "📊",
      title: "MCQ & Diagram Practice",
      description:
        "Practice multiple choice questions and diagram-based exercises with AI-powered feedback and detailed explanations.",
      gradient: "from-emerald-500 to-teal-500",
      link: "/mcqanddiagrams",
      stats: { label: "Questions Available", value: "100+" },
    },
  ];

  const highlights = [
    { icon: "🤖", label: "AI-Powered", value: "Advanced ML Models" },
    { icon: "⚡", label: "Real-time", value: "Instant Processing" },
    { icon: "🔒", label: "Secure", value: "Privacy First" },
    { icon: "🌐", label: "Bilingual", value: "English & සිංහල" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black transition-colors duration-300">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-cyan-400/30 to-blue-500/30 dark:from-cyan-500/20 dark:to-blue-600/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-500/30 dark:from-purple-500/20 dark:to-pink-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div
          className={`relative px-6 py-24 max-w-7xl mx-auto transition-all duration-1000 transform ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="text-center space-y-8">
            {/* Main Title */}
            <div className="space-y-4">
              <div className="inline-block">
                <span className="text-6xl sm:text-7xl animate-bounce inline-block">
                  🎓
                </span>
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

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Experience the future of education with AI-powered MCQ practice,
              diagram-based learning, and voice-controlled quizzing - all in
              one comprehensive platform.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3 justify-center pt-6">
              <Link
                to="/mcqanddiagrams"
                className="group px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold text-sm sm:text-base shadow-lg shadow-emerald-500/40 hover:shadow-emerald-500/60 transition-all duration-300 hover:scale-105 flex items-center gap-2"
              >
                <span className="text-lg sm:text-xl">📊</span>
                MCQ & Diagrams
                <span className="group-hover:translate-x-1 transition-transform duration-300">
                  →
                </span>
              </Link>
            </div>

            {/* ✅ Logged user info */}
            {me && (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Logged in as:{" "}
                <span className="font-bold">
                  {me.email || me.name || me.id}
                </span>
              </div>
            )}

            {/* Highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-8 max-w-4xl mx-auto">
              {highlights.map((item, index) => (
                <div
                  key={index}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:scale-105 transition-all duration-300 hover:shadow-lg"
                >
                  <div className="text-2xl sm:text-3xl mb-2">{item.icon}</div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {item.label}
                  </div>
                  <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-20 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Powerful Features
          </h2>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
            Everything you need for modern education management
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`group relative overflow-hidden rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-transparent transition-all duration-500 hover:scale-105 hover:shadow-2xl ${
                isVisible ? `animate-slide-up delay-${index * 100}` : "opacity-0"
              }`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
              ></div>

              <div className="relative bg-white dark:bg-gray-800 m-[2px] rounded-3xl p-8 h-full">
                <div
                  className={`text-6xl mb-4 inline-block p-4 rounded-2xl bg-gradient-to-br ${feature.gradient} bg-opacity-10`}
                >
                  {feature.icon}
                </div>

                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {feature.description}
                </p>

                <div
                  className={`inline-block px-4 py-2 rounded-xl bg-gradient-to-r ${feature.gradient} bg-opacity-10 mb-6`}
                >
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {feature.stats.label}: {feature.stats.value}
                  </span>
                </div>

                <Link
                  to={feature.link}
                  className={`inline-flex items-center gap-2 font-bold bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent group-hover:gap-3 transition-all duration-300`}
                >
                  Explore Now
                  <span className="transform group-hover:translate-x-1 transition-transform duration-300">
                    →
                  </span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 p-1">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-12 md:p-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 mb-6 max-w-2xl mx-auto">
                Join thousands of educators using our AI-powered platform to
                enhance their teaching and examination processes.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link
                  to="/mcqanddiagrams"
                  className="px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                >
                  📊 MCQ & Diagrams
                </Link>
              </div>

              {me && (
                <div className="mt-5 text-sm text-gray-700 dark:text-gray-300">
                  Welcome:{" "}
                  <span className="font-bold">
                    {me.email || me.name || me.id}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;

