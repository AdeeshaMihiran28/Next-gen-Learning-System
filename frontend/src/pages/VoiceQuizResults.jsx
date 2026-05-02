

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { Play, Square } from "lucide-react";
// ✅ PDF tools
import jsPDF from "jspdf";

// Convert a value to a safe number, with a default fallback.
function safeNum(n, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}

// Compute percentage from part / total, safely.
function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// Format a date/time string for display, with fallback to current local time.
function fmtDateTime(dt) {
  try {
    if (!dt) return new Date().toLocaleString();
    const d = typeof dt === "string" ? new Date(dt) : dt;
    return d.toLocaleString();
  } catch {
    return new Date().toLocaleString();
  }
}

// ✅ Build speaking tips based on voice label
function getVoiceTips(overallVoice, misconception) {
  const v = String(overallVoice || "").toLowerCase();

  if (v === "nervous") {
    return [
      "Slow down and take short pauses.",
      "Breathe once before starting.",
      "Answer structure: Definition, Example, Conclusion.",
    ];
  }
  if (v === "hesitant") {
    return [
      "Use a simple template: It is..., Used for..., Example...",
      "Replace 'umm' with silent pauses.",
      "Practice 3 quick questions daily from weak topic.",
    ];
  }
  if (v === "confident") {
    return [
      "Confidence is good—double-check facts before finishing.",
      "Say 1 key rule + 1 example. Don't over-explain.",
      misconception
        ? "Misconception detected: re-check core definitions of the worst topic."
        : "If unsure, say: 'I think...' then confirm with an example.",
    ];
  }
  return ["Speak clearly and keep answers short (10–20 seconds)."];
}

// ✅ Safe TTS: speak text using browser speechSynthesis
function speakText(text, { rate = 1, pitch = 1, lang = "en-US" } = {}) {
  if (typeof window === "undefined") return false;
  const synth = window.speechSynthesis;
  if (!synth) return false;

  // Stop any ongoing speech
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  utter.pitch = pitch;
  utter.lang = lang;

  synth.speak(utter);
  return true;
}

// Stop any ongoing speech synthesis.
function stopSpeech() {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
}

// Clean text for PDF generation, removing unsupported characters.
function cleanPdfText(value) {
  if (value == null) return "N/A";
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .trim();
}

// Add wrapped text to a jsPDF document at a given position.
function addWrappedText(pdf, text, x, y, maxWidth, lineHeight = 5) {
  const content = cleanPdfText(text) || "N/A";
  const lines = pdf.splitTextToSize(content, maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export default function VoiceQuizResults() {
  const { state } = useLocation();

  // Load quiz result state passed through navigation
  const answers = state?.answers || [];
  const sessionId = state?.sessionId || state?.session_id || "";
  const submittedAt =
    state?.submitted_at || state?.submittedAt || new Date().toISOString();

  const totalMarks = safeNum(state?.total_marks ?? state?.totalMarks ?? 0, 0);

  // from backend submit response
  const topicReport = state?.topic_report || null;
  const feedback = state?.feedback || null;

  const worstTopic = topicReport?.worst_topic || "N/A";
  const bestTopic = topicReport?.best_topic || "N/A";

  const allIncorrect = !!feedback?.all_incorrect;
  const mainFeedback = feedback?.messages?.main || "";
  const bestFeedback = feedback?.messages?.best_topic || "";
  const overallVoice =
    feedback?.voice_for_feedback || feedback?.overall_voice || "N/A";
  const misconception = !!feedback?.misconception;

  const voiceTips = useMemo(
    () => getVoiceTips(overallVoice, misconception),
    [overallVoice, misconception]
  );

  // ✅ logged in user info (name/email)
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await apiFetch("/api/auth/me");
        setMe(u?.user || null);
      } catch {
        setMe(null);
      }
    })();
  }, []);

  const totalQ = answers.length;
  const maxMarks = totalQ * 10;
  const scorePct = maxMarks ? Math.round((totalMarks / maxMarks) * 100) : 0;

  const overallLevel =
    scorePct >= 75
      ? "GOOD"
      : scorePct >= 50
      ? "PARTIAL"
      : scorePct >= 35
      ? "WEAK"
      : "INCORRECT";

  // Grade buckets
  const gradeCounts = useMemo(() => {
    return answers.reduce(
      (acc, a) => {
        const level = (a?.grade?.level || "").toUpperCase();
        if (level === "GOOD") acc.good += 1;
        else if (level === "PARTIAL") acc.partial += 1;
        else if (level === "WEAK") acc.weak += 1;
        else acc.incorrect += 1;
        return acc;
      },
      { good: 0, partial: 0, weak: 0, incorrect: 0 }
    );
  }, [answers]);

  // Voice confidence distribution (ignore NO_SPEECH)
  const voiceCounts = useMemo(() => {
    return answers.reduce((acc, a) => {
      const label = String(a?.voice_confidence?.predicted_label || "N/A");
      if (!label || label === "NO_SPEECH" || label === "N/A") return acc;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
  }, [answers]);

  const voiceTotal = useMemo(() => {
    return Object.values(voiceCounts).reduce((s, v) => s + v, 0);
  }, [voiceCounts]);

  // Find the most common voice label.
  const topVoice = useMemo(() => {
    let top = { label: "N/A", count: 0 };
    for (const [k, v] of Object.entries(voiceCounts)) {
      if (v > top.count) top = { label: k, count: v };
    }
    return top;
  }, [voiceCounts]);

  // Sort voice entries by count for display.
  const voiceEntriesSorted = useMemo(() => {
    return Object.entries(voiceCounts).sort((a, b) => b[1] - a[1]);
  }, [voiceCounts]);

  // ✅ Off-screen report root
  const reportRootRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  // ✅ NEW: speaking state per card
  const [speakingKey, setSpeakingKey] = useState(""); // "worst" | "best" | ""

  useEffect(() => {
    return () => {
      // stop when leaving page
      stopSpeech();
    };
  }, []);

  function handleSpeak(key, text) {
    // if same card is speaking -> stop
    if (speakingKey === key) {
      stopSpeech();
      setSpeakingKey("");
      return;
    }

    const ok = speakText(text, { rate: 1, pitch: 1, lang: "en-US" });
    if (!ok) {
      alert("Speech is not supported in this browser.");
      return;
    }
    setSpeakingKey(key);

    // auto reset when speech ends
    const synth = window.speechSynthesis;
    const checkEnd = setInterval(() => {
      if (!synth.speaking) {
        clearInterval(checkEnd);
        setSpeakingKey("");
      }
    }, 250);
  }

  // ✅ PERFECT PDF: capture report "blocks" one-by-one
  // ✅ USER-FRIENDLY + ATTRACTIVE PDF (replace only downloadReport)
async function downloadReport() {
  try {
    setDownloading(true);
    const pdf = new jsPDF("p", "mm", "a4");

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const margin = 12;
    const contentW = pageW - margin * 2;
    const bottom = pageH - 16; // reserve 16mm at bottom for per-page footer

    let y = margin;

    // ---------------- Helpers ----------------
    const ensureSpace = (needed = 10) => {
      if (y + needed > bottom) {
        pdf.addPage();
        y = margin;
      }
    };

    const setFont = (style = "normal") => pdf.setFont("helvetica", style);

    const textWrap = (text, x, yy, maxW, lh = 5) => {
      const t = cleanPdfText(text) || "N/A";
      const lines = pdf.splitTextToSize(t, maxW);
      pdf.text(lines, x, yy);
      return yy + lines.length * lh;
    };

    const line = (x1, yy, x2) => {
      pdf.setDrawColor(220);
      pdf.line(x1, yy, x2, yy);
    };

    // Rounded card background
    const card = (x, yy, w, h, { fill = [250, 250, 252], stroke = [230, 232, 240] } = {}) => {
      pdf.setFillColor(...fill);
      pdf.setDrawColor(...stroke);
      pdf.roundedRect(x, yy, w, h, 4, 4, "FD");
    };

    // Section Title bar
    const sectionTitle = (title) => {
      ensureSpace(14);
      card(margin, y, contentW, 10, { fill: [240, 248, 255], stroke: [210, 230, 245] });
      setFont("bold");
      pdf.setFontSize(12);
      pdf.setTextColor(20, 60, 120);
      pdf.text(title, margin + 4, y + 7);
      y += 14;
      pdf.setTextColor(0, 0, 0);
      setFont("normal");
    };

    const badge = (text, x, yy) => {
      const w = pdf.getTextWidth(text) + 8;
      pdf.setFillColor(225, 245, 255);
      pdf.setDrawColor(180, 220, 245);
      pdf.roundedRect(x, yy - 5, w, 7.5, 3, 3, "FD");
      pdf.setTextColor(0, 90, 140);
      setFont("bold");
      pdf.setFontSize(10);
      pdf.text(text, x + 4, yy);
      pdf.setTextColor(0, 0, 0);
      setFont("normal");
    };

    const smallTag = (text, x, yy, fill = [245, 245, 245], stroke = [220, 220, 220], tc = [60, 60, 60]) => {
      const w = pdf.getTextWidth(text) + 8;
      pdf.setFillColor(...fill);
      pdf.setDrawColor(...stroke);
      pdf.roundedRect(x, yy - 4.8, w, 7, 3, 3, "FD");
      pdf.setTextColor(...tc);
      setFont("bold");
      pdf.setFontSize(9.5);
      pdf.text(text, x + 4, yy);
      pdf.setTextColor(0, 0, 0);
      setFont("normal");
      return x + w + 3;
    };

    // ---------------- Data ----------------
    const studentName = me?.name || me?.full_name || me?.email || "Student";
    const studentEmail = me?.email || "N/A";
    const dateText = fmtDateTime(submittedAt);
    const sessionText = sessionId || "N/A";

    // ---------------- Header ----------------
    // Top banner
    card(margin, y, contentW, 18, { fill: [10, 110, 190], stroke: [10, 110, 190] });
    pdf.setTextColor(255, 255, 255);
    setFont("bold");
    pdf.setFontSize(16);
    pdf.text("Voice Quiz Report", margin + 5, y + 11);

    // Level badge on right
    const levelText = `LEVEL: ${overallLevel}`;
    const levelW = pdf.getTextWidth(levelText) + 10;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin + contentW - levelW - 4, y + 4, levelW, 10, 4, 4, "F");
    pdf.setTextColor(10, 110, 190);
    pdf.setFontSize(10);
    pdf.text(levelText, margin + contentW - levelW, y + 11);
    pdf.setTextColor(0, 0, 0);

    y += 24;

    // Info card
    ensureSpace(30);
    card(margin, y, contentW, 24, { fill: [250, 250, 252], stroke: [230, 232, 240] });

    setFont("bold");
    pdf.setFontSize(11);
    pdf.setTextColor(20, 20, 20);
    pdf.text(cleanPdfText(studentName), margin + 5, y + 9);

    setFont("normal");
    pdf.setFontSize(10);
    pdf.setTextColor(70, 70, 70);
    pdf.text(`Date: ${cleanPdfText(dateText)}`, margin + 5, y + 18);

    // Score box on right
    const sx = margin + contentW - 70;
    card(sx, y + 3, 65, 18, { fill: [240, 248, 255], stroke: [210, 230, 245] });
    setFont("bold");
    pdf.setFontSize(10);
    pdf.setTextColor(20, 60, 120);
    pdf.text("Score", sx + 5, y + 11);
    pdf.setFontSize(12.5);
    pdf.text(`${totalMarks}/${maxMarks} (${scorePct}%)`, sx + 5, y + 19);

    pdf.setTextColor(0, 0, 0);
    y += 30;

    // ---------------- Summary KPI Cards ----------------
    sectionTitle("Summary");

    const kpiH = 16;
    const gap = 4;
    const kpiW = (contentW - gap * 3) / 4;

    const kpi = (x, label, value, percent, fill) => {
      card(x, y, kpiW, kpiH, { fill, stroke: [230, 232, 240] });
      setFont("bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(60, 60, 60);
      pdf.text(label, x + 4, y + 6);
      pdf.setFontSize(13);
      pdf.setTextColor(20, 20, 20);
      pdf.text(String(value), x + 4, y + 13);
      pdf.setFontSize(9.5);
      pdf.setTextColor(90, 90, 90);
      pdf.text(`${percent}%`, x + kpiW - 10, y + 13);
      pdf.setTextColor(0, 0, 0);
      setFont("normal");
    };

    ensureSpace(22);
    kpi(margin, "GOOD", gradeCounts.good, pct(gradeCounts.good, totalQ), [236, 253, 245]);
    kpi(margin + (kpiW + gap), "PARTIAL", gradeCounts.partial, pct(gradeCounts.partial, totalQ), [255, 251, 235]);
    kpi(margin + (kpiW + gap) * 2, "WEAK", gradeCounts.weak, pct(gradeCounts.weak, totalQ), [255, 244, 235]);
    kpi(margin + (kpiW + gap) * 3, "INCORRECT", gradeCounts.incorrect, pct(gradeCounts.incorrect, totalQ), [255, 238, 240]);
    y += 22;

    // ---------------- Feedback ----------------
    if (mainFeedback || bestFeedback) {
      sectionTitle("Personal Feedback");

      ensureSpace(30);
      // Card
      const startY = y;
      card(margin, y, contentW, 10, { fill: [250, 250, 252], stroke: [230, 232, 240] });

      setFont("bold");
      pdf.setFontSize(11);
      pdf.setTextColor(20, 20, 20);
      pdf.text("Highlights", margin + 5, y + 7);

      y += 14;

      let xTag = margin + 5;
      xTag = smallTag(`Worst: ${worstTopic}`, xTag, y, [235, 245, 255], [200, 225, 245], [0, 90, 140]);
      if (bestTopic && bestTopic !== "N/A") {
        xTag = smallTag(`Best: ${bestTopic}`, xTag, y, [235, 255, 245], [200, 240, 220], [0, 120, 80]);
      }

      if (overallVoice && overallVoice !== "N/A") {
        xTag = smallTag(`Voice: ${overallVoice}`, xTag, y, [245, 245, 255], [225, 225, 245], [70, 60, 140]);
      }
      if (misconception) {
        xTag = smallTag("Misconception", xTag, y, [255, 235, 240], [255, 200, 215], [170, 0, 60]);
      }
      y += 10;

      // Main feedback
      if (mainFeedback) {
        ensureSpace(18);
        setFont("bold");
        pdf.setFontSize(10.5);
        pdf.setTextColor(20, 60, 120);
        pdf.text("Weakest Topic Feedback", margin + 5, y);
        y += 6;

        setFont("normal");
        pdf.setFontSize(10.5);
        pdf.setTextColor(60, 60, 60);
        y = textWrap(mainFeedback, margin + 5, y, contentW - 10, 5);
        y += 3;

        // Tips
        const tips = voiceTips.slice(0, 3);
        if (tips.length) {
          ensureSpace(18);
          setFont("bold");
          pdf.setFontSize(10.5);
          pdf.setTextColor(0, 120, 90);
          pdf.text("Voice Speaking Tips", margin + 5, y);
          y += 6;

          setFont("normal");
          pdf.setTextColor(60, 60, 60);
          for (const t of tips) {
            ensureSpace(8);
            y = textWrap(`• ${t}`, margin + 6, y, contentW - 12, 5);
          }
          y += 2;
        }
      }

      // Best feedback
      if (bestFeedback) {
        ensureSpace(18);
        setFont("bold");
        pdf.setFontSize(10.5);
        pdf.setTextColor(0, 120, 80);
        pdf.text("Best Topic Strength", margin + 5, y);
        y += 6;

        setFont("normal");
        pdf.setFontSize(10.5);
        pdf.setTextColor(60, 60, 60);
        y = textWrap(bestFeedback, margin + 5, y, contentW - 10, 5);
        y += 2;
      }

      // draw divider line under this section (optional)
      ensureSpace(10);
      line(margin, y + 2, margin + contentW);
      y += 8;

      // adjust header card height visually not needed in jsPDF (static)
      // (kept simple and stable)
    }

    // ---------------- Voice Pattern ----------------
    // Voice pattern report section
    sectionTitle("Voice Pattern Report");

    ensureSpace(20);
    setFont("normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(60, 60, 60);

    const mostCommonLine = `Most Common Voice: ${topVoice.label}${
      voiceTotal ? ` (${pct(topVoice.count, voiceTotal)}%)` : ""
    }`;
    y = textWrap(mostCommonLine, margin + 3, y, contentW - 6, 5);
    y += 3;

    if (voiceEntriesSorted.length === 0) {
      y = textWrap("No voice confidence labels available.", margin + 3, y, contentW - 6, 5);
      y += 4;
    } else {
      for (const [label, count] of voiceEntriesSorted) {
        ensureSpace(10);
        // row
        card(margin, y - 2, contentW, 8, { fill: [248, 250, 255], stroke: [230, 235, 245] });
        setFont("bold");
        pdf.setFontSize(10);
        pdf.setTextColor(30, 30, 30);
        pdf.text(label, margin + 4, y + 3);
        pdf.setTextColor(90, 90, 90);
        setFont("normal");
        pdf.text(`${count} (${pct(count, voiceTotal)}%)`, margin + contentW - 35, y + 3);
        y += 10;
      }
      y += 2;
    }

    // ---------------- Topic Performance ----------------
    // Topic performance table
    if (topicReport?.topics?.length) {
      sectionTitle("Topic Performance");

      // table header
      ensureSpace(12);
      card(margin, y - 2, contentW, 8, { fill: [245, 245, 245], stroke: [230, 232, 240] });
      setFont("bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(60, 60, 60);
      pdf.text("Topic", margin + 4, y + 3);
      pdf.text("Q", margin + contentW - 68, y + 3);
      pdf.text("Avg", margin + contentW - 50, y + 3);
      pdf.text("Incorrect%", margin + contentW - 28, y + 3);
      pdf.setTextColor(0, 0, 0);
      y += 10;

      // rows
      setFont("normal");
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);

      for (const t of topicReport.topics) {
        ensureSpace(10);
        const incPct = t?.incorrect_percent ?? t?.levels?.INCORRECT?.percent ?? 0;

        card(margin, y - 2, contentW, 8, { fill: [250, 250, 252], stroke: [230, 232, 240] });
        pdf.text(String(t.topic || "N/A"), margin + 4, y + 3);
        pdf.text(String(t.count ?? 0), margin + contentW - 68, y + 3);
        pdf.text(String(t.avg_marks ?? 0), margin + contentW - 50, y + 3);
        pdf.text(`${incPct}%`, margin + contentW - 28, y + 3);
        y += 10;
      }

      pdf.setTextColor(0, 0, 0);
      y += 3;
    }

    // ---------------- Question-wise ----------------
    // Question-wise report section
    sectionTitle("Question-wise Report");

    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];

      // Pre-calculate content height so card background fits content exactly
      pdf.setFontSize(11);
      const qLines = pdf.splitTextToSize(
        cleanPdfText(`Q${i + 1}. ${a?.question_text || "N/A"}`),
        contentW - 10
      );
      pdf.setFontSize(10.5);
      const uLines = pdf.splitTextToSize(cleanPdfText(a?.transcript || "(empty)"), contentW - 10);
      const cLines = pdf.splitTextToSize(cleanPdfText(a?.ideal_answer || "N/A"), contentW - 10);

      // Check if tags overflow to a second row
      pdf.setFontSize(9.5);
      const tagTexts = [
        `Topic: ${a?.topic || "UNKNOWN"}`,
        `Marks: ${a?.grade?.marks ?? 0} (${a?.grade?.level ?? "N/A"})`,
        `Voice: ${a?.voice_confidence?.predicted_label || "N/A"}`,
      ];
      const tagTotalW = tagTexts.reduce((s, t) => s + pdf.getTextWidth(t) + 11, 0);
      const tagRowH = tagTotalW > contentW - 10 ? 16 : 10;

      const calcH = 7 + qLines.length * 5     // question title
                  + tagRowH                     // tag row(s)
                  + 5 + uLines.length * 5      // "User Answer" label + text
                  + 3                           // gap
                  + 5 + cLines.length * 5      // "Correct Answer" label + text
                  + 4;                          // bottom padding

      ensureSpace(calcH + 10);

      // Draw card with exact calculated height
      card(margin, y, contentW, calcH, { fill: [250, 250, 252], stroke: [230, 232, 240] });

      // Q title
      setFont("bold");
      pdf.setFontSize(11);
      pdf.setTextColor(20, 20, 20);
      y = textWrap(`Q${i + 1}. ${a?.question_text || "N/A"}`, margin + 5, y + 7, contentW - 10, 5);

      // Tags with overflow wrapping
      const tagMaxX = margin + contentW - 5;
      let tx = margin + 5;
      let ty = y + 1;

      pdf.setFontSize(9.5);
      const placeTag = (text, fill, stroke, tc) => {
        const tagW = pdf.getTextWidth(text) + 8;
        if (tx + tagW > tagMaxX) {
          tx = margin + 5;
          ty += 8;
        }
        tx = smallTag(text, tx, ty, fill, stroke, tc);
      };

      placeTag(`Topic: ${a?.topic || "UNKNOWN"}`, [245, 245, 245], [230, 232, 240], [60, 60, 60]);
      placeTag(
        `Marks: ${a?.grade?.marks ?? 0} (${a?.grade?.level ?? "N/A"})`,
        [235, 245, 255], [200, 225, 245], [0, 90, 140]
      );
      placeTag(
        `Voice: ${a?.voice_confidence?.predicted_label || "N/A"}`,
        [245, 240, 255], [225, 220, 245], [80, 60, 140]
      );

      y = ty + 7;

      // Answer blocks
      setFont("bold");
      pdf.setFontSize(10);
      pdf.setTextColor(60, 60, 60);
      pdf.text("User Answer", margin + 5, y);
      y += 5;

      setFont("normal");
      pdf.setFontSize(10.5);
      pdf.setTextColor(40, 40, 40);
      y = textWrap(a?.transcript || "(empty)", margin + 5, y, contentW - 10, 5);

      y += 3;
      setFont("bold");
      pdf.setFontSize(10);
      pdf.setTextColor(0, 120, 80);
      pdf.text("Correct Answer", margin + 5, y);
      y += 5;

      setFont("normal");
      pdf.setFontSize(10.5);
      pdf.setTextColor(20, 90, 60);
      y = textWrap(a?.ideal_answer || "N/A", margin + 5, y, contentW - 10, 5);

      pdf.setTextColor(0, 0, 0);
      y += 8;
    }

    // Per-page footer with page numbers on every page
    const pageCount = pdf.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      pdf.setPage(p);
      setFont("italic");
      pdf.setFontSize(9);
      pdf.setTextColor(150, 150, 150);
      pdf.text("Generated by Voice Quiz System", margin, pageH - 6);
      pdf.text(`Page ${p} / ${pageCount}`, pageW - margin, pageH - 6, { align: "right" });
    }

    // Save
    const fileNameSafe = String(me?.email || "student")
      .replaceAll("@", "_")
      .replaceAll(".", "_");

    pdf.save(
      `voice_quiz_report_${fileNameSafe}_${new Date().toISOString().slice(0, 10)}.pdf`
    );
  } catch (e) {
    console.error(e);
    alert("PDF download failed. Check console for error.");
  } finally {
    setDownloading(false);
  }
}
  // ✅ Text to read in each card
  const worstSpeakText = useMemo(() => {
    const tips = voiceTips.map((t) => `Tip: ${t}`).join(". ");
    return `Worst topic is ${worstTopic}. Voice pattern is ${overallVoice}. ${
      misconception ? "Misconception detected. " : ""
    } Feedback: ${mainFeedback}. ${tips}`;
  }, [worstTopic, overallVoice, misconception, mainFeedback, voiceTips]);

   // Text prepared for speaking the best feedback card.
  const bestSpeakText = useMemo(() => {
    return `Best topic is ${bestTopic}. Strength feedback: ${bestFeedback}`;
  }, [bestTopic, bestFeedback]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#d9f3ff_0%,#f6fbff_42%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_top,#072137_0%,#08131f_45%,#020617_100%)] p-4 sm:p-6">
      <div className="max-w-6xl mx-auto rounded-3xl border border-slate-200/80 dark:border-slate-700/70 bg-white/85 dark:bg-slate-900/75 backdrop-blur-xl shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)] p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="rounded-2xl border border-cyan-200/80 dark:border-cyan-400/20 bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-700 p-5 sm:p-6 text-white shadow-lg flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Voice Quiz Results
            </h1>
            <div className="mt-2 text-sm text-white/90 leading-relaxed">
              Student:{" "}
              <b>{me?.name || me?.full_name || me?.email || "Student"}</b>{" "}
              {me?.email ? (
                <span className="opacity-90">({me.email})</span>
              ) : null}
              <span className="mx-2">|</span>
              Date: <b>{fmtDateTime(submittedAt)}</b>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-sm font-bold">
              Score: {totalMarks} / {maxMarks} ({scorePct}%)
            </div>
            <div className="mt-2 text-sm text-white/90">
              Overall Level: <b>{overallLevel}</b>
            </div>
            <button
              onClick={downloadReport}
              disabled={downloading}
              className="mt-3 px-4 py-2 rounded-xl bg-white text-sky-700 font-bold hover:bg-sky-50 disabled:opacity-60 transition-colors"
              title="Download report as PDF"
            >
              {downloading ? "Generating PDF..." : "Download Report (PDF)"}
            </button>
          </div>
        </div>

        {/* ✅ Feedback cards */}
        {allIncorrect ? (
          <div className="mt-6 p-5 rounded-2xl border border-rose-300/70 dark:border-rose-500/30 bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/15">
            <div className="font-bold text-rose-800 dark:text-rose-300 text-lg">
              Overall Feedback
            </div>
            <div className="mt-3 text-sm text-rose-900 dark:text-rose-200 leading-relaxed">
              {mainFeedback}
            </div>
          </div>
        ) : (mainFeedback || bestFeedback) && (
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            {/* Worst Topic */}
            {mainFeedback && (
              <div className="p-5 rounded-2xl border border-blue-200/70 dark:border-blue-400/25 bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/15">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-bold text-gray-900 dark:text-white">
                    Feedback (Weakest Topic)
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-white/85 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100">
                      {worstTopic}
                    </span>

                    {/* ✅ PLAY / STOP button */}
                    <button
  onClick={() => handleSpeak("worst", worstSpeakText)}
  type="button"
  className={[
    "group inline-flex h-9 w-9 items-center justify-center rounded-full",
    "border border-slate-200 bg-white/80 shadow-sm backdrop-blur",
    "hover:bg-white hover:shadow-md hover:-translate-y-[1px]",
    "active:translate-y-0 active:shadow-sm",
    "dark:border-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-800",
    "transition-all duration-200",
    speakingKey === "worst"
      ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10"
      : "",
  ].join(" ")}
  title={speakingKey === "worst" ? "Stop" : "Play voice"}
  aria-label={speakingKey === "worst" ? "Stop voice" : "Play voice"}
>
  {speakingKey === "worst" ? (
    <Square className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
  ) : (
    <Play className="h-4 w-4 text-slate-700 dark:text-slate-200" />
  )}
</button>
                  </div>
                </div>

                <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                  <b>Voice Pattern:</b> {overallVoice}{" "}
                  {misconception ? (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">
                      Misconception
                    </span>
                  ) : null}
                </div>

                {/* ✅ Voice speaking tips (inside this card) */}
                <div className="mt-3 p-3 rounded-xl bg-white/75 dark:bg-slate-900/35 border border-slate-200/80 dark:border-slate-700/60">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Voice Speaking Tips
                  </div>
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-700 dark:text-slate-200 space-y-1">
                    {voiceTips.slice(0, 3).map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                  {mainFeedback}
                </div>
              </div>
            )}

            {/* Best Topic */}
            {bestFeedback && (
              <div className="p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-400/25 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/15">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-bold text-gray-900 dark:text-white">
                    Strength (Best Topic)
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-white/85 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100">
                      {bestTopic}
                    </span>

                    {/* ✅ PLAY / STOP button */}
                    <button
  onClick={() => handleSpeak("best", bestSpeakText)}
  className="h-9 w-9 rounded-full bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:scale-105 transition"
  title={speakingKey === "best" ? "Stop" : "Play voice"}
  aria-label={speakingKey === "best" ? "Stop voice" : "Play voice"}
>
  {speakingKey === "best" ? (
    // ✅ STOP icon
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 text-emerald-600 dark:text-emerald-300"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  ) : (
    // ✅ PLAY icon
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 text-slate-700 dark:text-slate-200"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  )}
</button>
                  </div>
                </div>

                <div className="mt-3 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                  {bestFeedback}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ✅ Grade Summary */}

        <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/85 dark:bg-emerald-900/20">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
              Good
            </div>
            <div className="mt-2 text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">
              {gradeCounts.good}
            </div>
            <div className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
              {pct(gradeCounts.good, totalQ)}%
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-yellow-200 dark:border-yellow-500/30 bg-yellow-50/85 dark:bg-yellow-900/20">
            <div className="text-xs font-semibold uppercase tracking-wide text-yellow-800 dark:text-yellow-300">
              Partial
            </div>
            <div className="mt-2 text-3xl font-extrabold text-yellow-700 dark:text-yellow-300">
              {gradeCounts.partial}
            </div>
            <div className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
              {pct(gradeCounts.partial, totalQ)}%
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/85 dark:bg-orange-900/20">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-300">Weak</div>
            <div className="mt-2 text-3xl font-extrabold text-orange-700 dark:text-orange-300">
              {gradeCounts.weak}
            </div>
            <div className="mt-1 text-sm text-orange-800 dark:text-orange-200">
              {pct(gradeCounts.weak, totalQ)}%
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/85 dark:bg-rose-900/20">
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-300">
              Incorrect
            </div>
            <div className="mt-2 text-3xl font-extrabold text-rose-700 dark:text-rose-300">
              {gradeCounts.incorrect}
            </div>
            <div className="mt-1 text-sm text-rose-800 dark:text-rose-200">
              {pct(gradeCounts.incorrect, totalQ)}%
            </div>
          </div>
        </div>

        {/* ✅ Voice Pattern Report */}
        <div className="mt-6 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-lg font-bold text-white">Voice Pattern Report</div>
              <div className="text-sm text-slate-300 mt-1">
                NO_SPEECH labels are ignored.
              </div>
            </div>

            <div className="text-sm text-slate-200 flex items-center gap-2 flex-wrap">
              <span className="opacity-80">Most common:</span>
              <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-300/40 font-bold text-cyan-100">
                {topVoice.label}{" "}
                {voiceTotal ? `(${pct(topVoice.count, voiceTotal)}%)` : ""}
              </span>

              {misconception ? (
                <span className="px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-bold">
                  Misconception
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {voiceEntriesSorted.length === 0 ? (
              <div className="text-sm text-slate-300">
                No voice confidence labels available.
              </div>
            ) : (
              voiceEntriesSorted.map(([label, count]) => (
                <div
                  key={label}
                  className="p-4 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>{label}</span>
                    <span>{count}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                      style={{ width: `${pct(count, voiceTotal)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-300">
                    {pct(count, voiceTotal)}%
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ✅ Topic Performance Table */}
        {topicReport?.topics?.length ? (
          <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/60 overflow-hidden">
            <div className="px-5 py-4 bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700">
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                Topic Performance
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="py-3 px-5">Topic</th>
                    <th className="py-3 px-5">Questions</th>
                    <th className="py-3 px-5">Avg Marks</th>
                    <th className="py-3 px-5">Incorrect%</th>
                  </tr>
                </thead>
                <tbody>
                  {topicReport.topics.map((t) => {
                    const incPct =
                      t?.incorrect_percent ?? t?.levels?.INCORRECT?.percent ?? 0;
                    return (
                      <tr
                        key={t.topic}
                        className="border-t border-slate-200 dark:border-slate-700/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 px-5 font-semibold text-slate-900 dark:text-white">
                          {t.topic}
                        </td>
                        <td className="py-3 px-5 text-slate-700 dark:text-slate-200">
                          {t.count}
                        </td>
                        <td className="py-3 px-5 text-slate-700 dark:text-slate-200">
                          {t.avg_marks}
                        </td>
                        <td className="py-3 px-5 text-slate-700 dark:text-slate-200">
                          {incPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* ✅ Per-question details */}
        <div className="mt-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Question-wise Report
            </h2>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {answers.length} questions
            </div>
          </div>
          <div className="mt-4 space-y-4">
          {answers.map((a, i) => (
            <div
              key={i}
              className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/60 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="font-bold text-slate-900 dark:text-white">
                  Q{i + 1}. {a.question_text}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                    {a.topic || "UNKNOWN"}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700/40 text-xs font-bold text-cyan-700 dark:text-cyan-200">
                    Marks: {a.grade?.marks ?? 0} ({a.grade?.level ?? "N/A"})
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/40 text-xs font-bold text-indigo-700 dark:text-indigo-200">
                    Voice: {a.voice_confidence?.predicted_label || "N/A"}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/50 p-3">
                  <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-300">
                    User Answer
                  </div>
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {a.transcript || "(empty)"}
                  </div>
                  {a.raw_transcript && a.raw_transcript !== a.transcript && (
                    <div className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic border-t border-slate-200 dark:border-slate-700 pt-2">
                      <span className="font-semibold not-italic">STT:</span> {a.raw_transcript}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/70 dark:bg-emerald-900/20 p-3">
                  <div className="text-xs uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-300">
                    Correct Answer
                  </div>
                  <div className="mt-2 text-sm text-emerald-800 dark:text-emerald-100 leading-relaxed">
                    {a.ideal_answer || "N/A"}
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>

        {/* Footer navigation*/}
        <div className="mt-8 flex gap-3 flex-wrap">
          <Link
            to="/voice-quiz"
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 text-white font-bold shadow hover:brightness-110"
          >
            Start Again
          </Link>
          <Link
            to="/home"
            className="px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            Home
          </Link>
        </div>

        {/* =========================================================
            OFF-SCREEN PDF REPORT CONTENT (Blocks) - unchanged here
            (You can also add play icons to PDF, but PDF can't play sound)
        ========================================================== */}
        <div
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "794px",
            background: "#0b1220",
            zIndex: -1,
            opacity: 1,
            pointerEvents: "none",
          }}
        >
          <div
            ref={reportRootRef}
            style={{
              padding: 18,
              color: "#e6eefc",
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            {/* HEADER BLOCK */}
            <div
              data-pdf-block="1"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 18,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontSize: 26, fontWeight: 900 }}>
                    ✅ Voice Quiz Report
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: "#b9c7e6",
                      lineHeight: 1.5,
                    }}
                  >
                    Student:{" "}
                    <b style={{ color: "#e6eefc" }}>
                      {me?.name || me?.full_name || me?.email || "Student"}
                    </b>{" "}
                    {me?.email ? `(${me.email})` : ""}
                    <br />
                    Date:{" "}
                    <b style={{ color: "#e6eefc" }}>{fmtDateTime(submittedAt)}</b>
                    <br />
                    Session:{" "}
                    <b style={{ color: "#e6eefc" }}>{sessionId || "N/A"}</b>
                  </div>
                </div>

                <div
                  style={{
                    minWidth: 260,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 18,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#b9c7e6" }}>
                    Overall Score
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8 }}>
                    {totalMarks} / {maxMarks}
                  </div>
                  <div style={{ fontSize: 13, color: "#b9c7e6", marginTop: 6 }}>
                    Level: <b style={{ color: "#e6eefc" }}>{overallLevel}</b> (
                    {scorePct}%)
                  </div>
                </div>
              </div>
            </div>

            {/* FEEDBACK BLOCK */}
            {(mainFeedback || bestFeedback) && (
              <div
                data-pdf-block="1"
                style={{
                  marginTop: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900 }}>🧠 Feedback</div>

                {mainFeedback && (
                  <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        Worst Topic: <b>{worstTopic}</b>
                      </div>
                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        Voice: <b>{overallVoice}</b>
                      </div>
                      {misconception ? (
                        <div
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "rgba(255,0,90,0.20)",
                            border: "1px solid rgba(255,0,90,0.40)",
                            fontWeight: 800,
                          }}
                        >
                          Misconception
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 10 }}>{mainFeedback}</div>

                    {/* ✅ Tips added in PDF */}
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>🗣️ Voice Speaking Tips</div>
                      <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                        {voiceTips.slice(0, 3).map((t, idx) => (
                          <li key={idx} style={{ marginBottom: 4 }}>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {bestFeedback && (
                  <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.6 }}>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        display: "inline-block",
                      }}
                    >
                      Best Topic: <b>{bestTopic}</b>
                    </div>
                    <div style={{ marginTop: 10 }}>{bestFeedback}</div>
                  </div>
                )}
              </div>
            )}

            {/* ... keep rest of your PDF blocks as-is (KPI, Voice pattern, table, questions) */}

            <div
              data-pdf-block="1"
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "#b9c7e6",
              }}
            >
              Generated by Voice Quiz System
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
