import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import { apiFetch, BASE_URL } from "../utils/api";

// Calculate percentage
function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

// Clean question text (remove numbering like "1. ")
function cleanQuestionText(text) {
  return String(text || "").replace(/^\s*\d+\s*[\.\)]\s*/, "").trim();
}

// Normalize text (remove extra spaces)
function safeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// Convert status to readable format
function statusLabel(status) {
  if (status === "in_progress") return "In Progress";
  return "Not Started";
}

function applyAttemptToState(attempt, setAttempt, setAnswers, setCurrentIndex) {
  setAttempt(attempt);
  if (attempt?.phase === "mcq") {
    const map = {};
    (attempt?.mcq?.answers || []).forEach((a) => {
      map[a.id] = a.selected;
    });
    setAnswers(map);
    setCurrentIndex(0);
  }
}

function fmtNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(4) : "-";
}

export default function MCQDiagramPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);   // Stores assignment overview (title, deadline, etc.)
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reportRef = useRef(null);

  const loadOverview = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/mcq-diagram/overview");  // Fetch assignment details from backend
      setOverview(data);
      if (data.active_attempt) {   // If student already started → restore state
        applyAttemptToState(data.active_attempt, setAttempt, setAnswers, setCurrentIndex);
      } else {
        setAttempt(null);
      }
    } catch (e) {
      if (e.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("userRole");
        navigate("/login", { replace: true });
        return;
      }
      setError(e.message || "Failed to load assignment");
    } finally {
      setLoading(false);
    }
  };

  // Run once when page loads
  useEffect(() => {
    loadOverview();
  }, []);

  const mcqQuestions = attempt?.phase === "mcq" ? attempt?.mcq?.questions || [] : [];
  const currentQuestion = mcqQuestions[currentIndex] || null;

  const answeredCount = useMemo(
    () => mcqQuestions.filter((q) => answers[q.id]).length,
    [mcqQuestions, answers]
  );

  const handleStart = async () => {
    setBusy(true);
    setError("");
    try {    // Create new attempt in backend
      const data = await apiFetch("/api/mcq-diagram/start", { method: "POST" });
      applyAttemptToState(data.attempt, setAttempt, setAnswers, setCurrentIndex);
      const fresh = await apiFetch("/api/mcq-diagram/overview");
      setOverview(fresh);
    } catch (e) {
      setError(e.message || "Failed to start assignment");
    } finally {
      setBusy(false);
    }
  };

  const handleSelectAnswer = (qid, option) => {
    setAnswers((prev) => ({ ...prev, [qid]: option })); // store selected option by question ID
  };

  const handleSaveMcq = async () => {
    if (!attempt?.id) return;
    setBusy(true);
    setError("");
    try {    // Convert answers into backend format
      const payload = {
        answers: mcqQuestions.map((q) => ({ id: q.id, selected: answers[q.id] || "" })),
      };
      const data = await apiFetch(`/api/mcq-diagram/attempt/${attempt.id}/mcq-submit`, {    // Send answers to backend for evaluation
        method: "POST",
        body: payload,
      });
      setAttempt(data.attempt);    // Update attempt with results
      setSelectedFiles({});
    } catch (e) {
      setError(e.message || "Failed to save MCQ answers");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitDiagram = async () => {
    if (!attempt?.id) return;

     // Get diagram questions list
    const diagramQuestions =
      Array.isArray(attempt?.diagram_questions) && attempt.diagram_questions.length > 0
        ? attempt.diagram_questions
        : attempt?.diagram_question
        ? [attempt.diagram_question]
        : [];

    if (!diagramQuestions.length) return;

    if (diagramQuestions.some((q) => !selectedFiles[q.question_no])) {    // Validation: check all files uploaded
      setError("Please upload all required diagram answers");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      diagramQuestions.forEach((q) => {
        form.append("images", selectedFiles[q.question_no]);
      });

      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/mcq-diagram/attempt/${attempt.id}/diagram-submit`, {     // Send files to backend
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || "Diagram submit failed");

      setAttempt(data.attempt);     // Update attempt with evaluation results
      const fresh = await apiFetch("/api/mcq-diagram/overview");
      setOverview(fresh);
    } catch (e) {
      setError(e.message || "Failed to submit diagram");
    } finally {
      setBusy(false);
    }
  };

  const handleStartNext = async () => {
    setAttempt(null);
    setAnswers({});
    setSelectedFiles({});
    await handleStart();
  };

  const handleDownloadReport = async () => {
    if (!attempt || !reportRef.current) return;

    setBusy(true);
    setError("");
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 40;
      const pdfWidth = doc.internal.pageSize.getWidth() - margin * 2;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pageHeight = doc.internal.pageSize.getHeight() - margin * 2;

      let position = margin;
      doc.addImage(imgData, "PNG", margin, position, pdfWidth, pdfHeight);
      let heightLeft = pdfHeight - pageHeight;

      while (heightLeft > 0) {
        doc.addPage();
        position = margin - (pdfHeight - heightLeft);
        doc.addImage(imgData, "PNG", margin, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      doc.save(`assignment-report-${attempt.id}.pdf`);
    } catch (e) {
      setError("Unable to generate PDF report. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-8">
        <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-2xl p-8 shadow">
          <p className="text-gray-700 dark:text-gray-200">Loading assignment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {!attempt && <IntroCard overview={overview} onStart={handleStart} busy={busy} />} // If no attempt exists → show intro screen 

        {attempt?.phase === "mcq" && (
          <McqStage
            attempt={attempt}
            currentIndex={currentIndex}
            setCurrentIndex={setCurrentIndex}
            answers={answers}
            answeredCount={answeredCount}
            currentQuestion={currentQuestion}
            onSelectAnswer={handleSelectAnswer}
            onSave={handleSaveMcq}
            busy={busy}
          />
        )}

        {attempt?.phase === "diagram" && (
          <DiagramStage
            attempt={attempt}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            onSubmitDiagram={handleSubmitDiagram}
            busy={busy}
          />
        )}

        {attempt?.phase === "completed" && (  // if completed show results
          <CompletedStage
            attempt={attempt}
            onStartNext={handleStartNext}
            onEnd={() => navigate("/home")}
            onDownloadReport={handleDownloadReport}
            busy={busy}
          />
        )}
      </div>
      {attempt && (  // Hidden report content for PDF generation - only rendered when attempt exists
        <div
          ref={reportRef}
          style={{
            position: "fixed",
            left: -10000,
            top: 0,
            width: 800,
            padding: 24,
            backgroundColor: "#ffffff",
            color: "#111827",
            zIndex: -1,
            boxSizing: "border-box",
          }}
        >
          <ReportContents attempt={attempt} />
        </div>
      )}
    </div>
  );
}

function IntroCard({ overview, onStart, busy }) { // Intro screen before starting attempt
  const counts = overview?.counts || {};
  return (
    <div className="rounded-3xl overflow-hidden shadow-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 p-6 text-white">
        <div className="flex flex-wrap gap-3 mb-4">
          <span className="px-4 py-1.5 rounded-full bg-white/15 border border-white/25 text-sm font-semibold">
            February 2026
          </span>
          <span className="px-4 py-1.5 rounded-full bg-white text-gray-900 text-sm font-semibold">
            {statusLabel(overview?.status)}
          </span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold">{overview?.title || "MCQ and Diagram Assignment"}</h1>
        <p className="mt-2 text-white/90 font-medium">{overview?.course || "Course"}</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <InfoBox title="Published Date" value={overview?.published_date || "-"} tint="blue" />
          <InfoBox title="Deadline" value={overview?.deadline || "-"} tint="red" />
        </div>

        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Instructions</h2>
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-5 text-gray-700 dark:text-gray-300 leading-relaxed">
            {overview?.instructions}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Quiz Details</h2>
          <div className="grid md:grid-cols-3 gap-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-4">
            <MetricBox title="MCQ Questions" value={`${counts.mcq_questions_per_attempt || 10} Questions`} />
            <MetricBox title="Diagram Questions" value={`${counts.diagram_questions_per_attempt || 2} Questions`} />
            <MetricBox title="Completed" value={`${counts.mcq_completed || 0} MCQ / ${counts.diagram_completed || 0} Diagram`} />
          </div>
        </section>

        <button
          onClick={onStart}
          disabled={busy}
          className="w-full rounded-2xl py-4 text-lg font-bold text-white bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-lg hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "Starting..." : "Start Assignment"}
        </button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Completed questions are not repeated for the same logged-in user.
        </p>
      </div>
    </div>
  );
}

function McqStage({  // Stage for answering MCQ questions
  attempt,
  currentIndex,
  setCurrentIndex,
  answers,
  answeredCount,
  currentQuestion,
  onSelectAnswer,
  onSave,
  busy,
}) {
  const questions = attempt?.mcq?.questions || [];  // List of MCQ questions for this attempt
  const total = questions.length;  // Total number of MCQ questions
  const completePct = pct(answeredCount, total);  // Percentage of questions answered (for progress bar)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow">
        <div className="flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-300">
          <span>Question {Math.min(currentIndex + 1, total)} of {total}</span>
          <span>{completePct}% Complete</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${completePct}%` }} />
        </div>
      </div>

      {currentQuestion && (
        <div className="rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mb-5">
              {currentIndex + 1}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-relaxed mb-6">
              {cleanQuestionText(currentQuestion.question)}
            </h2>

            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => {
                const selected = answers[currentQuestion.id] === option;
                return (
                  <button
                    key={`${currentQuestion.id}-${idx}`}
                    type="button"
                    onClick={() => onSelectAnswer(currentQuestion.id, option)}
                    className={`w-full text-left rounded-2xl border px-4 py-4 transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-indigo-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full border ${selected ? "border-indigo-600 bg-indigo-600" : "border-gray-400"}`}>
                        {selected && <span className="block w-full h-full rounded-full scale-50 bg-white" />}
                      </span>
                      <span className="text-gray-900 dark:text-white">{option}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 p-5 flex flex-wrap gap-3 justify-between">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="px-5 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              Previous
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={busy || answeredCount !== total}
                className="px-5 py-3 rounded-xl border border-indigo-300 text-indigo-700 dark:text-indigo-300 dark:border-indigo-700 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save Answers"}
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
                disabled={currentIndex >= total - 1}
                className="px-5 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Question Navigator</h3>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
          {questions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const isDone = !!answers[q.id];
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`h-12 rounded-xl text-sm font-bold border ${
                  isCurrent
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : isDone
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DiagramStage({ attempt, selectedFiles, setSelectedFiles, onSubmitDiagram, busy }) {  // Stage for uploading diagram answers
  const mcq = attempt?.mcq_result || { score: 0, total: 0, results: [] };   // Get MCQ results for display

  const diagramQuestions =   // Get diagram questions list
    Array.isArray(attempt?.diagram_questions) && attempt.diagram_questions.length > 0  // If multiple diagram questions
      ? attempt.diagram_questions
      : attempt?.diagram_question
      ? [attempt.diagram_question]
      : [];

  const allSelected = diagramQuestions.length > 0 && diagramQuestions.every((q) => selectedFiles?.[q.question_no]);  // Check if all required files are selected for enabling submit button

  return (   // Display MCQ results summary and diagram upload interface
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <ScoreCard
          title="MCQ Questions"
          subtitle="Multiple Choice"
          score={`${mcq.score}/${mcq.total}`}
          percent={pct(mcq.score, mcq.total)}
          color="emerald"
        />
        <ScoreCard
          title="Diagram Questions"
          subtitle="AI Evaluated"
          score={`0/${diagramQuestions.length || 1}`}
          percent={0}
          color="violet"
        />
      </div>

      <div className="rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Diagram Questions</h2>

        <div className="space-y-4">
          {diagramQuestions.map((dq, idx) => (
            <div
              key={`${dq.question_no}-${idx}`}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/30"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {(dq.diagram_type || dq.question_code || "Diagram")} | Question {dq.question_no}
              </p>

              <p className="text-gray-800 dark:text-gray-200 mb-4 leading-relaxed">{dq.question_text}</p>

              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Upload answer image for this question
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setSelectedFiles((prev) => ({
                    ...prev,
                    [dq.question_no]: e.target.files?.[0] || null,
                  }))
                }
                className="block w-full text-sm text-gray-700 dark:text-gray-200"
              />

              {selectedFiles?.[dq.question_no] && (
                <p className="mt-2 text-sm text-indigo-700 dark:text-indigo-300">
                  Selected: {selectedFiles[dq.question_no].name}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onSubmitDiagram}
            disabled={!allSelected || busy}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white font-semibold disabled:opacity-50"
          >
            {busy ? "Submitting..." : "Submit Diagrams"}
          </button>
        </div>
      </div>

      <McqResultsList results={mcq.results} />
    </div>
  );
}

function CompletedStage({ attempt, onStartNext, onEnd, onDownloadReport, busy }) {  // Final stage showing results summary and options to start next assignment or download report
  const mcq = attempt?.mcq_result || { score: 0, total: 0, results: [] };  // Get MCQ results for display

  const diagramResults =   // Get diagram evaluation results - handle both single and multiple diagram question cases
    Array.isArray(attempt?.diagram_results) && attempt.diagram_results.length > 0
      ? attempt.diagram_results
      : attempt?.diagram_result
      ? [attempt.diagram_result]
      : [];

  const diagramScore = diagramResults.filter((r) => r?.pred_correct).length;  // Count how many diagram questions were predicted correct
  const diagramTotal = diagramResults.length || 1;  // Total number of diagram questions (default to 1 to avoid division by zero)

  const [showWrongDetailsByIndex, setShowWrongDetailsByIndex] = useState({});

  return (   // Display final results summary with MCQ and diagram scores, detailed feedback for diagram questions, and options to download report or start next assignment
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <ScoreCard
          title="MCQ Questions"
          subtitle="Multiple Choice"
          score={`${mcq.score}/${mcq.total}`}
          percent={pct(mcq.score, mcq.total)}
          color="emerald"
        />
        <ScoreCard
          title="Diagram Questions"
          subtitle="AI Evaluated"
          score={`${diagramScore}/${diagramTotal}`}
          percent={pct(diagramScore, diagramTotal)}
          color="violet"
        />
      </div>

      {(diagramResults.length ? diagramResults : [{}]).map((diagram, idx) => {  // Loop through diagram results (or show placeholder if none) and display detailed feedback for each diagram question
        const showWrongDetails = !!showWrongDetailsByIndex[idx];

        const wrongIssue = diagram.issue_description || diagram.pred_issue_text || "Wrong answer detected";
        const expectedFix = diagram.expected_correction || "";

        const confidence = diagram.pred_correct  // Calculate confidence based on prediction correctness
          ? diagram.correct_probability
          : (diagram.pred_issue_confidence ?? diagram.correct_probability);

        return (  // Display each diagram question's evaluation result with confidence score and option to show detailed feedback if wrong
          <div
            key={`${diagram.question_no || "unknown"}-${idx}`}
            className={`rounded-2xl border p-5 ${
              diagram.pred_correct
                ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-900/30"
                : "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30"
            }`}
          >
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Diagram Evaluation {diagramTotal > 1 ? `#${idx + 1}` : ""}
            </h3>

            <div className="flex flex-wrap gap-2 mb-3">  // Display tags for question number, code, and filename if available
              {diagram.question_no != null && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                  Question {diagram.question_no}
                </span>
              )}
              {diagram.question_code && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  {diagram.question_code}
                </span>
              )}
              {diagram.filename && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                  {diagram.filename}
                </span>
              )}
            </div>

            {diagram.question_text && (
              <p className="text-gray-800 dark:text-gray-200 mb-2">
                <span className="font-semibold">Question Text:</span> {diagram.question_text}
              </p>
            )}

            <p className="text-gray-800 dark:text-gray-200 mb-2">
              <span className="font-semibold">Result:</span> {diagram.pred_correct ? "Correct" : "Wrong"}
            </p>

            <p className="text-gray-800 dark:text-gray-200 mb-2">
              <span className="font-semibold">Confidence:</span> {fmtNum(confidence)}
            </p>

            {!diagram.pred_correct && (  // If the answer is wrong, show button to toggle detailed feedback
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowWrongDetailsByIndex((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                  className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                >
                  {showWrongDetails ? "Hide Wrong Details" : "Show Wrong Details"}
                </button>
              </div>
            )}

            {!diagram.pred_correct && showWrongDetails && (  // If wrong and details are toggled on, show detailed feedback including wrong issue, predicted type, confidence, and expected fix if available
              <div className="mt-3 space-y-2 text-red-800 dark:text-red-300">
                <p>
                  <span className="font-semibold">Wrong Issue:</span> {wrongIssue}
                </p>

                {diagram.pred_issue_text && diagram.pred_issue_text !== "UnknownWrong" && diagram.pred_issue_text !== "LowConfidenceWrong" && (
                  <p>
                    <span className="font-semibold">Predicted Type:</span> {diagram.pred_issue_text}{" "}
                    {diagram.pred_issue_confidence != null ? `(${fmtNum(diagram.pred_issue_confidence)})` : ""}
                  </p>
                )}

                {expectedFix && (  // Show expected fix if available to help student understand how to correct their answer
                  <p>
                    <span className="font-semibold">Expected Fix:</span> {expectedFix}
                  </p>
                )}
              </div>
            )}

            {diagram.pred_correct && (
              <p className="mt-3 text-emerald-700 dark:text-emerald-300 font-medium">Correct answer detected.</p>
            )}
          </div>
        );
      })}

      <McqResultsList results={mcq.results} />  // Show detailed results for each MCQ question as well

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onDownloadReport}
          className="px-6 py-3 rounded-xl border border-indigo-300 text-indigo-700 dark:text-indigo-300 dark:border-indigo-700 font-semibold shadow-sm hover:bg-indigo-50"
        >
          Download PDF Report
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="px-6 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white"
        >
          End
        </button>
        <button
          type="button"
          onClick={onStartNext}
          disabled={busy}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white font-semibold disabled:opacity-50"
        >
          {busy ? "Starting..." : "Start Next Assignment"}
        </button>
      </div>
    </div>
  );
}

function ReportContents({ attempt }) {  // This component generates the content for the PDF report based on the attempt data. It extracts MCQ results and diagram evaluation results, calculates scores, and formats everything into a printable layout.
  const mcq = attempt?.mcq_result || { score: 0, total: 0, results: [] };
  const diagramResults =
    Array.isArray(attempt?.diagram_results) && attempt.diagram_results.length > 0  // Handle both cases where diagram results could be an array (multiple diagram questions) or a single object (one diagram question)
      ? attempt.diagram_results
      : attempt?.diagram_result
      ? [attempt.diagram_result]
      : [];
  const diagramScore = diagramResults.filter((r) => r?.pred_correct).length;  // Count how many diagram questions were predicted correct to calculate diagram score for the report
  const diagramTotal = diagramResults.length || 1; // Total number of diagram questions (default to 1 to avoid division by zero when calculating percentage)

  return (  // The report layout is designed to be clean and professional, with sections for assignment overview, summary of results, detailed MCQ feedback, and detailed diagram evaluation feedback. It uses inline styles for simplicity in PDF generation.
    <div style={{ width: 800, padding: 24, fontFamily: "Arial, Helvetica, sans-serif", color: "#1f2937", backgroundColor: "#ffffff" }}>
      <div style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Assignment Performance Report</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Downloaded from Smart Learning Platform
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>  // Assignment overview section showing key details like assignment ID and status
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, backgroundColor: "#f8fafc" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Assignment ID</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{attempt.id}</div>
        </div>
        <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 16, backgroundColor: "#f8fafc" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Status</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{attempt.status || "completed"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <StatCard label="MCQ Score" value={`${mcq.score}/${mcq.total}`} />
        <StatCard label="Diagram Score" value={`${diagramScore}/${diagramTotal}`} />
      </div>

      <div style={{ marginBottom: 24 }}>  // Summary section showing key timestamps and overall performance metrics for both MCQ and diagram sections
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SummaryLine label="Started" value={attempt.created_at || "N/A"} />
          <SummaryLine label="Completed" value={attempt.completed_at || "N/A"} />
          <SummaryLine label="MCQ Completed" value={`${mcq.results?.length || 0}/${mcq.total}`} />
          <SummaryLine label="Diagram Evaluated" value={`${diagramResults.length}/${diagramTotal}`} />
        </div>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>MCQ Details</div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden", marginBottom: 24 }}>
        {(mcq.results || []).map((result, idx) => (
          <div key={result.id} style={{ padding: 16, backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{`Q${idx + 1}: ${safeText(result.question)}`}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: "#374151" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Your Answer</div>
                <div>{safeText(result.selected || "-")}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Correct Answer</div>
                <div>{safeText(result.correct_answer || "-")}</div>
              </div>
              <div style={{ gridColumn: "span 2", marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>Status</div>
                <div>{result.is_correct ? "Correct" : "Wrong"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Diagram Evaluation</div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden" }}>
        {diagramResults.map((diagram, idx) => (
          <div key={`${diagram.question_no || idx}`} style={{ padding: 16, backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{`Diagram ${idx + 1} • Question ${diagram.question_no || "N/A"}`}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: "#374151" }}>
              <SummaryLine label="Result" value={diagram.pred_correct ? "Correct" : "Wrong"} />
              <SummaryLine label="Confidence" value={safeText(diagram.correct_probability ?? diagram.pred_issue_confidence ?? "N/A")} />
              {diagram.question_text && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Prompt</div>
                  <div>{safeText(diagram.question_text)}</div>
                </div>
              )}
              {!diagram.pred_correct && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Issue</div>
                  <div>{safeText(diagram.issue_description || diagram.pred_issue_text || "Unknown")}</div>
                  {diagram.expected_correction && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontWeight: 600 }}>Expected Correction</div>
                      <div>{safeText(diagram.expected_correction)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {  // A simple card component used in the report to display key statistics like MCQ score and diagram score with a consistent style
  return (
    <div style={{ padding: 16, borderRadius: 16, backgroundColor: "#f8fafc", border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function SummaryLine({ label, value }) {  // A simple component for displaying a label and value pair in the summary section of the report, used for showing details like start time, completion time, MCQ completion status, etc.
  return (
    <div style={{ padding: 12, borderRadius: 12, backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>
  );
}

function McqResultsList({ results = [] }) {  // This component displays a list of MCQ results with details on each question, the user's selected answer, the correct answer if they got it wrong, and styling to indicate correct vs wrong answers. It's used in both the diagram stage and the completed stage to provide feedback on the MCQ performance.
  return (
    <div className="rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-5">MCQ Results</h2>
      <div className="space-y-4">
        {results.map((r, idx) => (
          <div
            key={r.id}
            className={`rounded-2xl border p-4 ${
              r.is_correct
                ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-900/30"
                : "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30"
            }`}
          >
            <p className="font-semibold text-gray-900 dark:text-white">
              Question {idx + 1}: {cleanQuestionText(r.question)}
            </p>
            <p className={`mt-2 text-sm ${r.is_correct ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
              Your Answer: {r.selected || "-"}
            </p>
            {!r.is_correct && (
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                Correct Answer: {r.correct_answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreCard({ title, subtitle, score, percent, color }) {  // A simple card component used in the report to display key performance metrics like MCQ score and diagram score with a consistent style
  const bar = color === "emerald" ? "bg-emerald-500" : "bg-violet-500";
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-gray-900 dark:text-white">{title}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{score}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{percent}%</p>
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function InfoBox({ title, value, tint }) { // A simple component for displaying key information like published date and deadline with different color tints (red for deadline, blue for published date) to visually differentiate them. Used in the intro card before starting the attempt.
  const classes =
    tint === "red"
      ? "border-red-100 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10"
      : "border-blue-100 bg-blue-50 dark:border-blue-900/30 dark:bg-blue-900/10";
  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function MetricBox({ title, value }) { // A simple component for displaying key metrics like number of MCQ questions, number of diagram questions, and completion status in the intro card. It uses a consistent style with a light background and border to visually group these metrics together.
  return (
    <div className="rounded-xl bg-white/70 dark:bg-gray-800/40 border border-white dark:border-gray-700 p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
