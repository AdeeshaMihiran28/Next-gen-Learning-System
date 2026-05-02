import { Link } from 'react-router-dom';

function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-auto transition-colors duration-300">
            <div className="px-6 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
                    {/* Brand Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-3xl">🎓</span>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                AI Learning System
                            </h3>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            AI-powered MCQ practice and diagram-based learning platform.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                            Quick Links
                        </h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    to="/home"
                                    className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                                >
                                    Home
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to="/mcqanddiagrams"
                                    className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                                >
                                    MCQ & Diagrams
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to="/profile"
                                    className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                                >
                                    Profile
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Features */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                            Features
                        </h4>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <li>✓ MCQ Practice</li>
                            <li>✓ Diagram Learning</li>
                            <li>✓ AI-Powered Feedback</li>
                            <li>✓ Secure Login</li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                            Connect
                        </h4>
                        <div className="space-y-3">
                            <a
                                href="mailto:support@aiproctoring.com"
                                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                            >
                                <span>📧</span>
                                <span>support@aiproctoring.com</span>
                            </a>
                            <div className="flex gap-4 pt-2">
                                <a
                                    href="#"
                                    className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-cyan-500 dark:hover:bg-cyan-500 hover:text-white transition-all duration-300 hover:scale-110"
                                    aria-label="LinkedIn"
                                >
                                    <span>💼</span>
                                </a>
                                <a
                                    href="#"
                                    className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-cyan-500 dark:hover:bg-cyan-500 hover:text-white transition-all duration-300 hover:scale-110"
                                    aria-label="GitHub"
                                >
                                    <span>💻</span>
                                </a>
                                <a
                                    href="#"
                                    className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-cyan-500 dark:hover:bg-cyan-500 hover:text-white transition-all duration-300 hover:scale-110"
                                    aria-label="Twitter"
                                >
                                    <span>🐦</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-gray-200 dark:border-gray-800 mt-8 pt-8 text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        &copy; {currentYear} AI Learning System. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
import { Link } from "react-router-dom";

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-auto transition-colors duration-300">
      <div className="px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🎓</span>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                AI Proctoring System
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Voice-based learning and assessment platform.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
              Quick Links
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/home"
                  className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/voice-quiz"
                  className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                >
                  Voice Quiz
                </Link>
              </li>
              <li>
                <Link
                  to="/profile"
                  className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                >
                  Profile
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
              Connect
            </h4>
            <div className="space-y-3">
              <a
                href="mailto:support@aiproctoring.com"
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
              >
                <span>📧</span>
                <span>support@aiproctoring.com</span>
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 mt-8 pt-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            &copy; {currentYear} AI Proctoring & Learning System. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
