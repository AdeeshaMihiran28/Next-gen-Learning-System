import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { apiFetch } from "../utils/api";
import { clearToken, isLoggedIn } from "../utils/auth";

function initials(nameOrEmail = "") {
  const s = String(nameOrEmail).trim();
  if (!s) return "U";
  const parts = s.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function Header() {
  const location = useLocation();
  const nav = useNavigate();

  const navLinks = [{ path: "/home", label: "Home", icon: "🏠" }];

  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  async function loadMe() {
    try {
      if (!isLoggedIn()) {
        setMe(null);
        return;
      }
      const data = await apiFetch("/api/auth/me");
      setMe(data?.user || null);
    } catch {
      setMe(null);
      clearToken();
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function logout() {
    clearToken();
    try { localStorage.removeItem("voice_quiz_draft_v1"); } catch {}
    setMe(null);
    setOpen(false);
    nav("/login");
  }

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 backdrop-blur-xl sticky top-0 z-50 shadow-sm transition-colors duration-300">
      <div className="px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/home"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity duration-300"
          >
            <div className="text-2xl sm:text-3xl">🎓</div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white transition-colors duration-300">
                AI Proctoring & Learning System
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-xs mt-0.5 transition-colors duration-300 hidden sm:block">
                Voice Answer Platform
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <nav className="hidden md:flex gap-2 items-center">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 hover:scale-105 ${
                    location.pathname === link.path
                      ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/30"
                      : "bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600/50 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  <span className="text-sm">{link.label}</span>
                </Link>
              ))}
            </nav>

            <ThemeToggle />

            {!me ? (
              <Link
                to="/login"
                className="px-4 py-2 rounded-lg text-sm font-bold bg-cyan-600 text-white hover:bg-cyan-700 transition"
              >
                Login
              </Link>
            ) : (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600/50 transition"
                  title="Profile"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white flex items-center justify-center font-extrabold">
                    {initials(me?.name || me?.email)}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-bold text-gray-900 dark:text-white leading-4">
                      {me?.name || "Student"}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      {me?.email}
                    </div>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300 text-sm">
                    ▾
                  </span>
                </button>

                {open && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                    <Link
                      to="/profile"
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      👤 Profile
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        View account details
                      </div>
                    </Link>

                    <button
                      onClick={logout}
                      className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Logout
                      <div className="text-xs text-red-500/80 mt-1">
                        Sign out from the system
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="md:hidden mt-3 flex gap-2 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
                location.pathname === link.path
                  ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300"
              }`}
            >
              <span>{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

export default Header;
