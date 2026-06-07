


import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL, apiFetch } from "../utils/api";

// Total quiz duration: 13 minutes expressed in milliseconds.
const QUIZ_DURATION_MS = 13 * 60 * 1000; // 13 minutes

// Local storage key used to save draft quiz progress.
const DRAFT_KEY = "voice_quiz_draft_v1";

// Helper function to format milliseconds into MM:SS for timer display.
function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function micErrorMessage(err) {
  const name = err?.name || "";

  if (!navigator.mediaDevices?.getUserMedia) {
    return "Microphone API unavailable. Open this app in Chrome, Edge, or Firefox on localhost or 127.0.0.1.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission denied. Allow microphone access in the browser site settings and reload.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone found. Connect a microphone and try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Microphone is unavailable or busy in another app. Close other apps using it and try again.";
  }
  if (name === "SecurityError") {
    return "Microphone access is blocked on this origin. Open the app on localhost or 127.0.0.1.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "Requested microphone settings are not supported on this device.";
  }

  return err?.message || "Microphone is not available.";
}

export default function VoiceQuizPage() {
  const nav = useNavigate();

  // Loading state while quiz data is being prepared.
  const [loading, setLoading] = useState(true);
  // Current backend session ID for this quiz.
  const [sessionId, setSessionId] = useState(null);

   // List of loaded quiz questions.
  const [questions, setQuestions] = useState([]);
   // Current question index being shown.
  const [idx, setIdx] = useState(0);

  // answers[i] = {question_id, topic, question_text, ideal_answer, transcript, grade, voice_confidence}
  const [answers, setAnswers] = useState([]);

  // MediaRecorder and audio chunk storage.
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  // Recording & processing flags.
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  // General error message shown in the UI.
  const [err, setErr] = useState("");

    // Text-to-speech controls.
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [ttsErr, setTtsErr] = useState("");

  // TIMER STATE (persisted)
  const [remainingMs, setRemainingMs] = useState(QUIZ_DURATION_MS);
  const [paused, setPaused] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  // NEW: timer starts only after first answer is saved
  const [timerStarted, setTimerStarted] = useState(false);

  // Prevent duplicate auto-submit when time expires.
  const autoSubmittedRef = useRef(false);

  // ---------- DRAFT SAVE/LOAD helpers ----------
  function saveDraft(next = {}) {
    try {
      const payload = {
        version: 2, // bump version
        savedAt: Date.now(),
        sessionId,
        questions,
        answers,
        idx,
        remainingMs,
        paused,
        timeUp,
        autoSpeak,
        timerStarted, // persist
        ...next,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {}
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  // Auto-submit (used when timer hits 0)
  async function submitAll(auto = false) {
    setErr("");
    try {
      const total = answers.reduce((s, a) => s + (a?.grade?.marks || 0), 0);

      const r = await apiFetch("/api/quiz/submit", {
        method: "POST",
        body: { session_id: sessionId, answers, total_marks: total },
      });

      clearDraft();

      nav("/voice-quiz-results", {
        state: {
          sessionId,
          questions,
          answers: r?.answers || answers,
          total_marks: r.total_marks,
          report_summary: r.report_summary,
          voice_pattern: r.voice_pattern,
          topic_report: r.topic_report,
          feedback: r.feedback,
          topic_insights: r.topic_insights,
          submitted_at: r.submitted_at || new Date().toISOString(),
          auto_submitted: auto,
        },
      });
    } catch (e) {
      setErr(e.message);
    }
  }

  // Load draft first (refresh-resume)
  useEffect(() => {
    (async () => {
      try {
        setErr("");
        await apiFetch("/auth/me");// validate user session

        let draft = null;
        try {
          draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
        } catch {
          draft = null;
        }

        // Resume draft (supports version 1 or 2)
        const draftOk =
          (draft?.version === 1 || draft?.version === 2) &&
          Array.isArray(draft.questions) &&
          draft.questions.length > 0 &&
          Array.isArray(draft.answers) &&
          draft.answers.length === draft.questions.length &&
          typeof draft.remainingMs === "number";

        const draftAnsweredCount = draftOk ? draft.answers.filter(Boolean).length : 0;
        const firstUnansweredIdx = draftOk ? draft.answers.findIndex((answer) => !answer) : -1;
        const resumeIdx =
          draftOk && firstUnansweredIdx >= 0
            ? firstUnansweredIdx
            : 0;

        // Restore an active draft.
        if (draftOk && draftAnsweredCount >= draft.questions.length) {
          clearDraft();
        } else if (draftOk && !draft.timeUp) {
          setSessionId(draft.sessionId || null);
          setQuestions(draft.questions);
          setAnswers(draft.answers);
          setIdx(resumeIdx);
          setRemainingMs(draft.remainingMs > 0 ? draft.remainingMs : 0);
          setPaused(!!draft.paused);
          setTimeUp(!!draft.timeUp);
          setAutoSpeak(!!draft.autoSpeak);

          // if old draft (v1) -> timerStarted = true (since old system started immediately)
          if (draft.version === 1) {
            setTimerStarted(true);
          } else {
            setTimerStarted(!!draft.timerStarted);
          }

          setLoading(false);
          return;
        } else if (draftOk && draft.timeUp) {
          setSessionId(draft.sessionId || null);
          setQuestions(draft.questions || []);
          setAnswers(draft.answers || []);
          setIdx(resumeIdx);
          setRemainingMs(0);
          setPaused(true);
          setTimeUp(true);
          setAutoSpeak(!!draft.autoSpeak);
          setTimerStarted(true);

          setLoading(false);
          return;
        } else {
          clearDraft();
        }

        // 2) Fresh start(Fresh quiz start path)
        let answeredIds = [];
        try {
          const prev = await apiFetch("/api/quiz/answered-ids");
          answeredIds = prev.ids || [];
        } catch {
          answeredIds = [];
        }
        const answeredSet = new Set(answeredIds.map(String));
        
        // Load question pool from backend.
        const poolRes = await fetch(`${BASE_URL}/ict/questions/random?count=60`);
        const poolData = await poolRes.json();
        if (!poolRes.ok)
          throw new Error(poolData?.error || "Failed to load questions");

        const pool = poolData.questions || [];
        const fresh = pool
          .filter((q) => !answeredSet.has(String(q.question_id)))
          .sort(() => Math.random() - 0.5);

        const picked = fresh.slice(0, 10);
        if (picked.length < 10) {
          const need = 10 - picked.length;
          const extra = pool
            .filter(
              (q) =>
                !picked.find((x) => String(x.question_id) === String(q.question_id))
            )
            .slice(0, need);
          picked.push(...extra);
        }

        setQuestions(picked);
        setAnswers(Array(picked.length).fill(null));
        setIdx(0);

        const s = await apiFetch("/api/quiz/start", {
          method: "POST",
          body: { questions: picked, mode: "voice" },
        });
        setSessionId(s.session_id);

        // timer NOT started until first answer
        setRemainingMs(QUIZ_DURATION_MS);
        setTimerStarted(false);

        setPaused(false);
        setTimeUp(false);
        autoSubmittedRef.current = false;
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft whenever important state changes
  useEffect(() => {
    if (loading) return;
    if (!questions?.length) return;
    saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading,
    sessionId,
    questions,
    answers,
    idx,
    remainingMs,
    paused,
    timeUp,
    autoSpeak,
    timerStarted,
  ]);

  // Auto pause/resume on tab + window focus (NO buttons)
  useEffect(() => {
    function onVis() {
      if (document.hidden) setPaused(true);
      else if (!timeUp) setPaused(false);
    }
    function onBlur() {
      if (!timeUp) setPaused(true);
    }
    function onFocus() {
      if (!timeUp) setPaused(false);
    }

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [timeUp]);


  // Countdown tick (ONLY if timerStarted)
  useEffect(() => {
    if (loading) return;
    if (!timerStarted) return; // WAIT until first answer
    if (paused) return;
    if (timeUp) return;

    const t = setInterval(() => {
      setRemainingMs((ms) => {
        const next = ms - 1000;
        if (next <= 0) return 0;
        return next;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [loading, timerStarted, paused, timeUp]);

  // When hits 0 => timeUp + auto submit
  useEffect(() => {
    if (loading) return;
    if (timeUp) return;
    if (!timerStarted) return; // only if started

    if (remainingMs <= 0) {
      setTimeUp(true);
      setPaused(true);

      try {
        if (mediaRecorderRef.current && recording) {
          mediaRecorderRef.current.stop();
        }
      } catch {}

      if (!autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        if (sessionId) submitAll(true);
        else setErr("Session missing. Please refresh.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, timeUp, loading, sessionId, recording, timerStarted]);

  const q = questions[idx];
  const modelQuestionNumber = (q?.question_id ?? "").toString().trim();
  const currentAnswer = answers[idx];
  const isLocked = !!currentAnswer;

  const doneCount = answers.filter(Boolean).length;

  // Submit active if ALL done OR timeUp (with at least 1 answer) + session exists
  const canSubmit =
    (!!sessionId && doneCount === questions.length) ||
    (!!sessionId && timeUp && doneCount > 0);

  const aiStatus = processing
    ? "AI Status: Listening & Analyzing Tone..."
    : recording
    ? "AI Status: Listening..."
    : timeUp
    ? "AI Status: Time Over"
    : isLocked
    ? "AI Status: Answer Saved"
    : "AI Status: Ready";
  
  // Speak the current question via browser TTS.
  function speakQuestion() {
    try {
      setTtsErr("");
      if (!q?.question_text) return;

      if (!("speechSynthesis" in window)) {
        setTtsErr("Text-to-Speech not supported in this browser.");
        return;
      }

      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(q.question_text);
      u.lang = "en-US";
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;

      window.speechSynthesis.speak(u);
    } catch {
      setTtsErr("TTS failed. Please try again.");
    }
  }

  function stopSpeak() {
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch {}
  }

  useEffect(() => {
    if (!autoSpeak) return;
    if (!q?.question_text) return;
    speakQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, autoSpeak]);

  useEffect(() => () => stopSpeak(), []);
  
  // Start recording audio for the current question.
  async function startRecording() {
    if (isLocked) return;
    if (timeUp) {
      setErr("Time is over. You can only submit completed answers now.");
      return;
    }
    setErr("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      setErr(micErrorMessage(e));
    }
  }

  // Stop recording and send audio to grade.
  async function stopRecordingAndGrade() {
    if (!mediaRecorderRef.current || isLocked) return;
    if (timeUp) {
      setErr("Time is over. You can only submit completed answers now.");
      return;
    }

    setRecording(false);
    setProcessing(true);
    setErr("");

    const mr = mediaRecorderRef.current;

    const blobPromise = new Promise((resolve) => {
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        resolve(blob);
      };
    });

    mr.stop();
    const blob = await blobPromise;

    try {
      const form = new FormData();
      form.append("question_id", q.question_id);
      form.append("question_text", q.question_text);
      form.append("audio", blob, "answer.webm");

      const res = await fetch(`${BASE_URL}/ict/grade-voice`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Voice grading failed");

      const vcLabel = data?.voice_confidence?.predicted_label;
      const normalizedVoiceLabel = ["Confident", "Hesitant", "Nervous"].includes(vcLabel)
        ? vcLabel
        : "";
      if (
        vcLabel === "NO_SPEECH" ||
        !normalizedVoiceLabel ||
        !data?.transcript ||
        data?.transcript.trim() === ""
      ) {
        setErr("Voice pattern was not classified. Please speak clearly and try again.");
        return;
      }

      const item = {
        question_id: data.question_id,
        topic: data.topic || q.topic || "UNKNOWN",
        question_text: data.question_text,
        ideal_answer: data.ideal_answer,
        transcript: data.transcript,
        raw_transcript: data.raw_transcript,
        grade: data.grade,
        voice_confidence: data.voice_confidence,
      };

      // Save answer
      setAnswers((prev) => {
        const next = [...prev];
        next[idx] = item;
        return next;
      });

      // START TIMER only when first answer is saved
      if (!timerStarted) {
        setTimerStarted(true);
        setPaused(false);
      }

      if (idx < questions.length - 1) setIdx(idx + 1);
    } catch (e) {
      setErr(e.message);
    } finally {
      setProcessing(false);
    }
  }

  function nextQ() {
    setIdx((v) => Math.min(v + 1, questions.length - 1));
  }
  function prevQ() {
    setIdx((v) => Math.max(v - 1, 0));
  }

  if (loading) return <div className="p-8">Loading voice quiz...</div>;
  if (!q) return <div className="p-8 text-red-600">No questions loaded. {err}</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <style>{`
        .heroWrap{
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          background: radial-gradient(1200px 500px at 50% -100px, rgba(255,255,255,0.10), rgba(0,0,0,0.0)),
                      linear-gradient(180deg, rgba(2,6,23,0.92), rgba(2,6,23,0.70));
          border: 1px solid rgba(255,255,255,0.10);
        }
        .heroGlow{
          position:absolute; inset:-80px;
          background: radial-gradient(circle at 50% 30%, rgba(99,102,241,0.25), transparent 60%),
                      radial-gradient(circle at 20% 60%, rgba(34,211,238,0.20), transparent 55%),
                      radial-gradient(circle at 80% 65%, rgba(168,85,247,0.20), transparent 55%);
          filter: blur(18px);
          opacity: 0.9;
          pointer-events:none;
        }
        .statusPill{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:8px 12px;
          border-radius:999px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(226,232,240,0.95);
          font-size: 12px;
          font-weight: 700;
          backdrop-filter: blur(10px);
        }
        .dot{
          width:8px;height:8px;border-radius:99px;
          background: rgba(34,211,238,0.95);
          box-shadow: 0 0 16px rgba(34,211,238,0.75);
        }
        .dot.rec{
          background: rgba(239,68,68,0.95);
          box-shadow: 0 0 16px rgba(239,68,68,0.75);
          animation: pulseDot 1.1s infinite;
        }
        @keyframes pulseDot{
          0%{ transform: scale(1); opacity: 0.75; }
          50%{ transform: scale(1.25); opacity: 1; }
          100%{ transform: scale(1); opacity: 0.75; }
        }
        .waveRow{
          height: 44px;
          display:flex;
          align-items:flex-end;
          justify-content:center;
          gap: 6px;
          margin-top: 18px;
        }
        .bar{
          width: 6px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(34,211,238,0.95), rgba(168,85,247,0.95));
          opacity: 0.9;
          height: 10px;
        }
        .bar.animate{
          animation: wave 1.1s infinite ease-in-out;
        }
        .bar:nth-child(1){ animation-delay: 0.00s; }
        .bar:nth-child(2){ animation-delay: 0.08s; }
        .bar:nth-child(3){ animation-delay: 0.16s; }
        .bar:nth-child(4){ animation-delay: 0.24s; }
        .bar:nth-child(5){ animation-delay: 0.32s; }
        .bar:nth-child(6){ animation-delay: 0.24s; }
        .bar:nth-child(7){ animation-delay: 0.16s; }
        .bar:nth-child(8){ animation-delay: 0.08s; }
        .bar:nth-child(9){ animation-delay: 0.00s; }
        @keyframes wave{
          0%{ height: 10px; opacity: 0.55; }
          30%{ height: 42px; opacity: 1; }
          60%{ height: 18px; opacity: 0.75; }
          100%{ height: 10px; opacity: 0.55; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        <div className="heroWrap p-8 sm:p-10">
          <div className="heroGlow" />

          <div className="relative flex items-center justify-center gap-3">
            <div className="statusPill" title="Voice status" style={{ marginTop: -8 }}>
              <span className={`dot ${recording ? "rec" : ""}`} />
              {aiStatus}
            </div>

            <div className="statusPill" title="Time Remaining" style={{ marginTop: -8 }}>
              Time: <span className="text-white">{fmt(remainingMs)}</span>
              {!timerStarted && !timeUp ? " (Waiting...)" : ""}
              {paused && timerStarted && !timeUp ? " (Paused)" : ""}
            </div>
          </div>

          <div className="relative mt-10 text-center">
            <div className="flex items-center justify-between text-slate-200/90 text-sm">
              <div className="font-bold">Voice Quiz ({idx + 1}/{questions.length})</div>
              <div>
                Answered: <b className="text-white">{doneCount}</b> / {questions.length}
              </div>
            </div>

            <div className="mt-6 text-sm text-slate-300/80">
              Question
              {modelQuestionNumber ? (
                <span className="ml-2 text-slate-200/90 font-semibold">
                  (Model No: {modelQuestionNumber})
                </span>
              ) : null}
            </div>

            <div className="mt-2 text-3xl sm:text-4xl font-extrabold text-white leading-tight">
              {q.question_text}
            </div>

            <div className="mt-4 text-slate-200/90 text-base">
              Topic: <b className="text-white">{q.topic || "UNKNOWN"}</b>
            </div>

            <div className="mt-4">
              {timeUp ? (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-400/15 text-red-100 border border-red-300/20 text-sm font-bold">
                  Time Over (auto-submitted)
                </span>
              ) : isLocked ? (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-400/15 text-emerald-100 border border-emerald-300/20 text-sm font-bold">
                  Answer saved (locked)
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-400/15 text-yellow-100 border border-yellow-300/20 text-sm font-bold">
                  Not answered yet
                </span>
              )}
            </div>

            <div className="waveRow">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className={`bar ${(recording || processing) ? "animate" : ""}`}
                  style={{
                    height: (recording || processing) ? undefined : 10,
                    opacity: (recording || processing) ? undefined : 0.45,
                  }}
                />
              ))}
            </div>

            <div className="mt-3 text-xs text-slate-300/80">
              {timeUp
                ? "Time is over. You can submit completed answers only."
                : !timerStarted
                ? "Timer will start after you submit your first answer."
                : recording
                ? "Listening... Speak clearly."
                : processing
                ? "Analyzing your answer..."
                : isLocked
                ? "Answer saved. You can move to next question."
                : "Press Start Recording to answer."}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          {err && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">
              {err}
            </div>
          )}

          {ttsErr && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-50 text-yellow-800 border border-yellow-200 text-sm">
              {ttsErr}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={speakQuestion}
              disabled={processing}
              className="px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60"
            >
              Speak Question
            </button>

            <button
              onClick={stopSpeak}
              disabled={processing}
              className="px-5 py-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-semibold disabled:opacity-60"
            >
              Stop
            </button>

            <label className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
              />
              Auto-speak
            </label>

            {!recording ? (
              <button
                onClick={startRecording}
                disabled={processing || isLocked || timeUp}
                className="px-5 py-3 rounded-xl bg-purple-600 text-white font-semibold disabled:opacity-60"
              >
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecordingAndGrade}
                disabled={processing || isLocked || timeUp}
                className="px-5 py-3 rounded-xl bg-red-600 text-white font-semibold disabled:opacity-60"
              >
                Stop & Check
              </button>
            )}

            <button
              onClick={prevQ}
              disabled={idx === 0 || processing}
              className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold disabled:opacity-60"
            >
              Previous
            </button>

            <button
              onClick={nextQ}
              disabled={idx === questions.length - 1 || processing}
              className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold disabled:opacity-60"
            >
              Next
            </button>

            <button
              onClick={() => submitAll(false)}
              disabled={!canSubmit || processing}
              className="ml-auto px-5 py-3 rounded-xl bg-cyan-600 text-white font-bold disabled:opacity-60"
            >
              Submit All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
