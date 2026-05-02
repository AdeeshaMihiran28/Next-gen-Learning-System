import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import ThemeToggle from './components/ThemeToggle';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import QuizConfigScreen from './components/QuizConfigScreen';
import QuizComponent from './components/QuizComponent';
import QuizResults from './components/QuizResults';
import ProctoringWidget from './components/ProctoringWidget';
import LectureRecorderPage from './pages/LectureRecorderPage';
import ExamAnalysisPage from './pages/ExamAnalysisPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AdminDashboard from './pages/AdminDashboard';
import AttendanceCounterPage from './pages/AttendanceCounterPage';
import StudentDashboard from './pages/StudentDashboard';
import SmartAttendersPage from './pages/SmartAttendersPage';
import './App.css';

// Main quiz app component
function QuizApp() {
    const [appState, setAppState] = useState('config'); // 'config', 'quiz', 'results'
    const [quizData, setQuizData] = useState(null);
    const [quizResult, setQuizResult] = useState(null);
    const [language, setLanguage] = useState('en'); // 'en' or 'si'
    const [examSessionId, setExamSessionId] = useState(null);

    const gradeFromPercentage = (p) => {
        if (p >= 90) return 'A+';
        if (p >= 80) return 'A';
        if (p >= 70) return 'B';
        if (p >= 60) return 'C';
        if (p >= 50) return 'D';
        return 'F';
    };

    const handleStartQuiz = async (data) => {
        setQuizData(data);
        setAppState('quiz');

        // Create an exam session on the backend
        try {
            const user = JSON.parse(localStorage.getItem('user') || 'null');
            const studentName = user?.username || 'Student';
            const res = await fetch('http://localhost:8000/exam-sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student: studentName,
                    exam_topic: data?.topic || 'General',
                    events: []
                })
            });
            const result = await res.json();
            if (result.session_id) {
                setExamSessionId(result.session_id);
                localStorage.setItem('currentExamSessionId', result.session_id);
            }
        } catch (e) {
            console.warn('Could not create exam session', e);
        }
    };

    const handleSubmitQuiz = async (result) => {
        setQuizResult(result);
        setAppState('results');
        try {
            localStorage.setItem('lastQuizResult', JSON.stringify(result));
        } catch (e) {
            console.warn('Could not persist quiz result', e);
        }

        // Update the exam session with score data
        const sid = examSessionId || localStorage.getItem('currentExamSessionId');
        if (sid) {
            try {
                await fetch(`http://localhost:8000/exam-sessions/${sid}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        score: result.score,
                        total: result.total,
                        percentage: result.percentage,
                        grade: gradeFromPercentage(result.percentage),
                        ended_at: new Date().toISOString()
                    })
                });
            } catch (e) {
                console.warn('Could not update exam session', e);
            }
        }
    };

    const handleRetakeQuiz = () => {
        setQuizData(null);
        setQuizResult(null);
        setExamSessionId(null);
        localStorage.removeItem('currentExamSessionId');
        setAppState('config');
    };

    // Only show proctoring during quiz
    const isExamActive = appState === 'quiz';

    // Config screen (no proctoring)
    if (appState === 'config') {
        return (
            <Layout>
                <QuizConfigScreen onStartQuiz={handleStartQuiz} />
            </Layout>
        );
    }

    // Results screen (no proctoring)
    if (appState === 'results') {
        return (
            <Layout>
                <QuizResults result={quizResult} onRetakeQuiz={handleRetakeQuiz} />
            </Layout>
        );
    }

    // Quiz screen (with proctoring)
    return (
        <div className="app-container min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 backdrop-blur-xl shadow-sm transition-colors duration-300">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 transition-colors duration-300">
                            <span className="text-3xl">🎓</span>
                            AI Exam Proctoring System
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 transition-colors duration-300">Monitored Exam in Progress</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Language Toggle */}
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700/50 p-2 rounded-xl border border-gray-200 dark:border-gray-600/50 transition-colors duration-300">
                            <button
                                onClick={() => setLanguage('en')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${language === 'en'
                                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                English
                            </button>
                            <button
                                onClick={() => setLanguage('si')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${language === 'si'
                                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                සිංහල
                            </button>
                        </div>

                        <ThemeToggle />
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="h-[calc(100vh-80px)] flex">
                {/* Quiz Area - Takes most of the space */}
                <div className="flex-1 overflow-hidden bg-white dark:bg-gray-900 transition-colors duration-300">
                    <QuizComponent
                        quizData={quizData}
                        onSubmit={handleSubmitQuiz}
                    />
                </div>

                {/* Proctoring Sidebar */}
                <div className="w-96 p-4 bg-gray-50 dark:bg-gray-800/50 border-l border-gray-200 dark:border-gray-700/50 overflow-y-auto transition-colors duration-300">
                    <ProctoringWidget
                        isActive={isExamActive}
                        language={language}
                    />
                </div>
            </div>
        </div>
    );
}



function App() {
    return (
        <ThemeProvider>
            <BrowserRouter>
                <Routes>
                    {/* Home Page Route */}
                    <Route path="/home" element={<Layout><HomePage /></Layout>} />

                    {/* Default route redirects to home */}
                    <Route path="/" element={<Layout><HomePage /></Layout>} />

                    {/* Quiz System Route */}
                    <Route path="/quiz" element={<QuizApp />} />

                    {/* Exam Analysis Route */}
                    <Route
                        path="/analysis"
                        element={<Layout><ExamAnalysisPage /></Layout>}
                    />

                    {/* Auth Routes */}
                    <Route path="/login" element={<Layout><LoginPage /></Layout>} />
                    <Route path="/signup" element={<Layout><SignupPage /></Layout>} />

                    {/* Dashboards */}
                    <Route path="/admin" element={<Layout><AdminDashboard /></Layout>} />
                    <Route path="/student" element={<Layout><StudentDashboard /></Layout>} />
                    <Route path="/lecture-recorder" element={<Layout><LectureRecorderPage /></Layout>} />
                    <Route path="/attendance-counter" element={<Layout><AttendanceCounterPage /></Layout>} />
                    <Route path="/smart-attenders" element={<Layout><SmartAttendersPage /></Layout>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
}

export default App;

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Profile from "./pages/Profile";
import MCQDiagramPage from "./pages/MCQDiagramPage";
import VoiceQuizPage from "./pages/VoiceQuizPage";
import VoiceQuizResults from "./pages/VoiceQuizResults";
import "./App.css";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <HomePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Layout>
                  <HomePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mcqanddiagrams"
            element={
              <ProtectedRoute>
                <Layout>
                  <MCQDiagramPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/voice-quiz"
            element={
              <ProtectedRoute>
                <VoiceQuizPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/voice-quiz-results"
            element={
              <ProtectedRoute>
                <VoiceQuizResults />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
