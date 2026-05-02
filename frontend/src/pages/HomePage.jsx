import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import { clearToken } from "../utils/auth";

function HomePage() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    async function loadMe() {
      try {
        const response = await apiFetch("/api/auth/me");
        setMe(response?.user || null);
      } catch {
        clearToken();
        setMe(null);
      }
    }
    void loadMe();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            AI Learning Platform
          </h1>
          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Practice MCQ, diagrams, and voice quizzes in one place.
          </p>
          {me ? (
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
              Logged in as <span className="font-semibold">{me.email || me.name || me.id}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-4">
          <Link
            to="/mcqanddiagrams"
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 hover:shadow-md transition"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              MCQ and Diagrams
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Practice structured questions and diagram tasks.
            </p>
          </Link>

          <Link
            to="/voice-quiz"
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 hover:shadow-md transition"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Voice Quiz
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Answer quiz questions with your voice.
            </p>
          </Link>

          <Link
            to="/profile"
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 hover:shadow-md transition"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Profile
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Manage account details and session information.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
