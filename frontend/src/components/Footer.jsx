import { Link } from "react-router-dom";

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-auto transition-colors duration-300">
      <div className="px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              AI Learning System
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Voice and MCQ based learning platform.
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
                  to="/mcqanddiagrams"
                  className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
                >
                  MCQ and Diagrams
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
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
              Contact
            </h4>
            <a
              href="mailto:support@aiproctoring.com"
              className="text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors duration-200 text-sm"
            >
              support@aiproctoring.com
            </a>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 mt-8 pt-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            &copy; {currentYear} AI Learning System. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
