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
