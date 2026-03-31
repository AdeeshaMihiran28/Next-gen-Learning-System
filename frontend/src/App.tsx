import { FormEvent, useEffect, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";

type TemplateInfo = {
  template_id: string;
  filename: string;
  size: number;
  content_type?: string;
};

type JobStatus = {
  job_id: string;
  status: string;
  progress: number;
  created_at: string;
  updated_at: string;
  logs: string[];
  output_url: string | null;
  error_message: string | null;
};

type ArtifactAvailability = {
  job_id: string;
  artifacts: {
    cleaned?: string | null;
    removed_preview?: string | null;
    kept_preview?: string | null;
    report?: string | null;
    segments_csv?: string | null;
    transcript_json?: string | null;
  };
};

type StructuredSummary = {
  overview?: string;
  key_topics?: Array<string | Record<string, unknown>>;
  definitions?: Array<string | Record<string, unknown>>;
  takeaways?: Array<string | Record<string, unknown>>;
  outline?: Array<string | Record<string, unknown>>;
};

type SummaryGenerationResponse = {
  job_id: string;
  status: string;
  message?: string;
};

type ProcessingOptionsState = {
  black_d: number;
  black_pix_th: number;
  silence_noise_db: number;
  silence_d: number;
  freeze_enabled: boolean;
  freeze_sampling_fps: number;
  freeze_diff_threshold: number;
  freeze_min_duration: number;
  generate_kept_preview: boolean;
  enable_buffering_detect: boolean;
  buffering_sample_fps: number;
  buffering_match_thresh: number;
  buffering_min_d: number;
  whisper_model: string;
  whisper_language: string;
  no_speech_min_d: number;
  freeze_min_no_speech_overlap: number;
  freeze_force_remove_sec: number;
  strict_no_cut_speech: boolean;
  speech_overlap_threshold_sec: number;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const DEFAULT_OPTIONS: ProcessingOptionsState = {
  black_d: 0.2,
  black_pix_th: 0.98,
  silence_noise_db: -35,
  silence_d: 0.5,
  freeze_enabled: true,
  freeze_sampling_fps: 2,
  freeze_diff_threshold: 0.01,
  freeze_min_duration: 1.0,
  generate_kept_preview: false,
  enable_buffering_detect: true,
  buffering_sample_fps: 1,
  buffering_match_thresh: 0.9,
  buffering_min_d: 1.0,
  whisper_model: "base",
  whisper_language: "en",
  no_speech_min_d: 0.75,
  freeze_min_no_speech_overlap: 0.5,
  freeze_force_remove_sec: 3.0,
  strict_no_cut_speech: true,
  speech_overlap_threshold_sec: 0.2,
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/jobs/:job_id" element={<JobDetailsPage />} />
    </Routes>
  );
}

function UploadPage() {
  const navigate = useNavigate();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [templateFiles, setTemplateFiles] = useState<File[]>([]);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [autoStart, setAutoStart] = useState(true);
  const [options, setOptions] = useState<ProcessingOptionsState>(DEFAULT_OPTIONS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isUploadingTemplates, setIsUploadingTemplates] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");

  useEffect(() => {
    void fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setIsLoadingTemplates(true);
    try {
      const payload = await requestJson<{ templates: TemplateInfo[] }>("/api/templates", {
        errorMessage: "Failed to load templates.",
      });
      setTemplates(payload.templates);
      setSelectedTemplateIds((current) =>
        current.filter((templateId) => payload.templates.some((template) => template.template_id === templateId)),
      );
      setTemplateMessage("");
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : "Failed to load templates.");
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  function updateOption(name: keyof ProcessingOptionsState, value: string | boolean) {
    setOptions((current) => ({
      ...current,
      [name]:
        typeof current[name] === "number" && typeof value === "string"
          ? Number(value)
          : value,
    }));
  }

  function toggleTemplateSelection(templateId: string) {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((value) => value !== templateId)
        : [...current, templateId],
    );
  }

  async function handleTemplateUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (templateFiles.length === 0) {
      setTemplateMessage("Select one or more template images first.");
      return;
    }

    setIsUploadingTemplates(true);
    setTemplateMessage("");

    const formData = new FormData();
    for (const file of templateFiles) {
      formData.append("files", file);
    }

    try {
      const payload = await requestJson<{ templates: TemplateInfo[] }>("/api/templates/upload", {
        method: "POST",
        body: formData,
        errorMessage: "Template upload failed.",
      });
      setTemplateFiles([]);
      setTemplateMessage(`Uploaded ${payload.templates.length} template file(s).`);
      await fetchTemplates();
      setSelectedTemplateIds((current) => {
        const next = new Set(current);
        for (const template of payload.templates) {
          next.add(template.template_id);
        }
        return Array.from(next);
      });
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : "Template upload failed.");
    } finally {
      setIsUploadingTemplates(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!videoFile) {
      setErrorMessage("Select a video file before submitting.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("auto_start", String(autoStart));

    for (const [key, value] of Object.entries(options)) {
      formData.append(key, String(value));
    }

    for (const templateId of selectedTemplateIds) {
      formData.append("buffering_template_ids", templateId);
    }

    try {
      const payload = await requestJson<{ job_id: string }>("/api/upload", {
        method: "POST",
        body: formData,
        errorMessage: "Upload failed.",
      });
      navigate(`/jobs/${payload.job_id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="page-header">
          <h1 className="page-title">Lecture Video Cleaner</h1>
          <p className="page-intro">
            Upload a lecture video, manage buffering templates, and choose processing options before starting a job.
          </p>
        </header>

        <div className="stack">
          <section className="panel">
            <div className="section-header">
              <h2 className="section-title">Buffering Templates</h2>
              {isLoadingTemplates ? <span className="helper-text">Loading templates...</span> : null}
            </div>

            <form onSubmit={handleTemplateUpload} className="subform">
              <label className="field">
                <span className="field-label">Template image files</span>
                <input
                  className="input"
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  multiple
                  onChange={(event) => setTemplateFiles(Array.from(event.target.files ?? []))}
                />
                <span className="helper-text">
                  {templateFiles.length > 0
                    ? `${templateFiles.length} file(s) selected`
                    : "Accepted formats: PNG, JPG, JPEG"}
                </span>
              </label>

              <button
                type="submit"
                disabled={isUploadingTemplates || templateFiles.length === 0}
                className="button button-secondary"
              >
                {isUploadingTemplates ? "Uploading Templates..." : "Upload Templates"}
              </button>
            </form>

            {templateMessage ? <p className="helper-text">{templateMessage}</p> : null}

            <div className="template-list">
              {templates.length === 0 ? (
                <p className="empty-text">No buffering templates uploaded yet.</p>
              ) : (
                templates.map((template) => (
                  <label key={template.template_id} className="template-card">
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.includes(template.template_id)}
                      onChange={() => toggleTemplateSelection(template.template_id)}
                    />
                    <div>
                      <div className="template-name">{template.filename}</div>
                      <div className="template-meta">ID: {template.template_id}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </section>

          <form onSubmit={handleSubmit} className="stack">
            <section className="panel">
              <h2 className="section-title">Video Upload</h2>
              <label className="field">
                <span className="field-label">Lecture video</span>
                <input
                  className="input"
                  type="file"
                  accept="video/*"
                  onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                />
                <span className="helper-text">
                  {videoFile ? `Selected: ${videoFile.name}` : "Choose a single video file to upload."}
                </span>
              </label>

              <label className="checkbox-row">
                <input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} />
                <span>Auto-start processing after upload</span>
              </label>

              <p className="helper-text">
                Selected templates: {selectedTemplateIds.length > 0 ? selectedTemplateIds.join(", ") : "none"}
              </p>
            </section>

            <section className="panel">
              <h2 className="section-title">Detection Options</h2>
              <div className="form-grid">
                <NumberField label="Black duration" value={options.black_d} step="0.1" onChange={(value) => updateOption("black_d", value)} />
                <NumberField label="Black pixel threshold" value={options.black_pix_th} step="0.01" onChange={(value) => updateOption("black_pix_th", value)} />
                <NumberField label="Silence noise dB" value={options.silence_noise_db} step="1" onChange={(value) => updateOption("silence_noise_db", value)} />
                <NumberField label="Silence minimum duration" value={options.silence_d} step="0.1" onChange={(value) => updateOption("silence_d", value)} />
                <CheckboxField label="Enable freeze detection" checked={options.freeze_enabled} onChange={(value) => updateOption("freeze_enabled", value)} />
                <NumberField label="Freeze sampling FPS" value={options.freeze_sampling_fps} step="1" onChange={(value) => updateOption("freeze_sampling_fps", value)} />
                <NumberField label="Freeze diff threshold" value={options.freeze_diff_threshold} step="0.01" onChange={(value) => updateOption("freeze_diff_threshold", value)} />
                <NumberField label="Freeze minimum duration" value={options.freeze_min_duration} step="0.1" onChange={(value) => updateOption("freeze_min_duration", value)} />
                <CheckboxField label="Generate kept preview" checked={options.generate_kept_preview} onChange={(value) => updateOption("generate_kept_preview", value)} />
                <CheckboxField label="Enable buffering detection" checked={options.enable_buffering_detect} onChange={(value) => updateOption("enable_buffering_detect", value)} />
                <NumberField label="Buffering sample FPS" value={options.buffering_sample_fps} step="1" onChange={(value) => updateOption("buffering_sample_fps", value)} />
                <NumberField label="Buffering match threshold" value={options.buffering_match_thresh} step="0.01" onChange={(value) => updateOption("buffering_match_thresh", value)} />
                <NumberField label="Buffering minimum duration" value={options.buffering_min_d} step="0.1" onChange={(value) => updateOption("buffering_min_d", value)} />
              </div>
            </section>

            <section className="panel">
              <h2 className="section-title">Speech Options</h2>
              <div className="form-grid">
                <TextField label="Whisper model" value={options.whisper_model} onChange={(value) => updateOption("whisper_model", value)} />
                <TextField label="Whisper language" value={options.whisper_language} onChange={(value) => updateOption("whisper_language", value)} />
                <NumberField label="No-speech minimum duration" value={options.no_speech_min_d} step="0.1" onChange={(value) => updateOption("no_speech_min_d", value)} />
                <NumberField label="Freeze minimum no-speech overlap" value={options.freeze_min_no_speech_overlap} step="0.1" onChange={(value) => updateOption("freeze_min_no_speech_overlap", value)} />
                <NumberField label="Freeze force-remove seconds" value={options.freeze_force_remove_sec} step="0.1" onChange={(value) => updateOption("freeze_force_remove_sec", value)} />
                <CheckboxField label="Strict no-cut speech" checked={options.strict_no_cut_speech} onChange={(value) => updateOption("strict_no_cut_speech", value)} />
                <NumberField label="Speech overlap threshold" value={options.speech_overlap_threshold_sec} step="0.1" onChange={(value) => updateOption("speech_overlap_threshold_sec", value)} />
              </div>
            </section>

            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

            <button type="submit" disabled={isSubmitting || !videoFile} className="button button-primary">
              {isSubmitting ? "Uploading..." : "Upload Video"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function JobDetailsPage() {
  const { job_id } = useParams();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [artifactAvailability, setArtifactAvailability] = useState<ArtifactAvailability | null>(null);
  const [summary, setSummary] = useState<StructuredSummary | null>(null);
  const [summaryPdfAvailable, setSummaryPdfAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");

  useEffect(() => {
    if (!job_id) {
      setErrorMessage("Job ID is missing.");
      setIsLoading(false);
      return;
    }

    const currentJobId = job_id;
    let isCancelled = false;

    async function fetchInitialState() {
      try {
        const { jobPayload, artifactPayload } = await loadJobDetails(currentJobId);
        if (isCancelled) {
          return;
        }

        setJob(jobPayload);
        setArtifactAvailability(artifactPayload);
        setErrorMessage("");
        await loadSummary(currentJobId, { silentNotFound: true, setSummary, setSummaryMessage });
        await checkSummaryPdf(currentJobId, setSummaryPdfAvailable);
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load job details.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchInitialState();

    return () => {
      isCancelled = true;
    };
  }, [job_id]);

  useEffect(() => {
    if (!job || job.status !== "queued" && job.status !== "running") {
      return;
    }

    let isCancelled = false;

    const timeoutId = window.setTimeout(() => {
      void loadJobDetails(job.job_id)
        .then(({ jobPayload, artifactPayload }) => {
          if (isCancelled) {
            return;
          }
          setJob(jobPayload);
          setArtifactAvailability(artifactPayload);
          setErrorMessage("");
        })
        .catch((error: unknown) => {
          if (!isCancelled) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to refresh job details.");
          }
        });
    }, 3000);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [job]);

  const availableArtifacts = job_id
    ? [
        artifactAvailability?.artifacts.cleaned
          ? { label: "Cleaned Video", href: artifactAvailability.artifacts.cleaned }
          : job?.output_url
            ? { label: "Cleaned Video", href: job.output_url }
            : null,
        artifactAvailability?.artifacts.removed_preview
          ? { label: "Removed Preview", href: artifactAvailability.artifacts.removed_preview }
          : null,
        artifactAvailability?.artifacts.kept_preview
          ? { label: "Kept Preview", href: artifactAvailability.artifacts.kept_preview }
          : null,
        artifactAvailability?.artifacts.report
          ? { label: "Report", href: artifactAvailability.artifacts.report }
          : null,
        artifactAvailability?.artifacts.segments_csv
          ? { label: "Segments CSV", href: artifactAvailability.artifacts.segments_csv }
          : null,
        artifactAvailability?.artifacts.transcript_json
          ? { label: "Transcript Log", href: artifactAvailability.artifacts.transcript_json }
          : null,
      ].filter((artifact): artifact is { label: string; href: string } => artifact !== null)
    : [];

  async function handleGenerateSummary() {
    if (!job_id) {
      setSummaryMessage("Job ID is missing.");
      return;
    }

    setIsGeneratingSummary(true);
    setSummaryMessage("");

    try {
      const response = await requestJson<SummaryGenerationResponse>("/api/jobs/" + job_id + "/summary", {
        method: "POST",
        errorMessage: "Failed to request summary generation.",
      });

      await loadSummary(job_id, { silentNotFound: true, setSummary, setSummaryMessage });
      await checkSummaryPdf(job_id, setSummaryPdfAvailable);

      if (response.status === "not_implemented" && response.message) {
        setSummaryMessage(response.message);
      } else if (!summary) {
        setSummaryMessage("Summary request completed. Preview is not available yet.");
      }
    } catch (error) {
      setSummaryMessage(error instanceof Error ? error.message : "Failed to request summary generation.");
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="page-header">
          <h1 className="page-title">Job Details</h1>
          <p className="page-intro">Track the processing status for job: {job_id}</p>
        </header>

        <section className="panel">
          {isLoading ? <p className="helper-text">Loading job details...</p> : null}
          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          {job ? (
            <div className="stack">
              <div className="status-grid">
                <StatusCard label="Status" value={job.status} />
                <StatusCard label="Progress" value={`${job.progress}%`} />
                <StatusCard label="Created" value={formatDateTime(job.created_at)} />
                <StatusCard label="Updated" value={formatDateTime(job.updated_at)} />
              </div>

              {job.error_message ? (
                <div className="alert-box">
                  <strong>Error</strong>
                  <p className="alert-text">{job.error_message}</p>
                </div>
              ) : null}

              <div>
                <h2 className="section-title">Logs</h2>
                {job.logs.length === 0 ? (
                  <p className="empty-text">No log entries yet.</p>
                ) : (
                  <div className="log-list">
                    {job.logs.map((logEntry, index) => (
                      <div key={`${index}-${logEntry}`} className="log-item">
                        {logEntry}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="section-title">Artifacts</h2>
                {availableArtifacts.length === 0 ? (
                  <p className="empty-text">No artifacts available yet.</p>
                ) : (
                  <div className="artifact-list">
                    {availableArtifacts.map((artifact) => (
                      <a
                        key={artifact.href}
                        href={buildApiUrl(artifact.href)}
                        target="_blank"
                        rel="noreferrer"
                        className="artifact-link"
                      >
                        {artifact.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="summary-header">
                  <h2 className="section-title">Summary</h2>
                  <button
                    type="button"
                    onClick={() => void handleGenerateSummary()}
                    disabled={isGeneratingSummary}
                    className="button button-secondary"
                  >
                    {isGeneratingSummary ? "Generating Summary..." : "Generate Summary"}
                  </button>
                </div>

                {summaryMessage ? <p className="helper-text">{summaryMessage}</p> : null}

                {summaryPdfAvailable && job_id ? (
                  <a
                    href={buildApiUrl(`/api/jobs/${job_id}/summary.pdf`)}
                    target="_blank"
                    rel="noreferrer"
                    className="artifact-link"
                  >
                    Open Summary PDF
                  </a>
                ) : null}

                {summary ? (
                  <div className="summary-preview">
                    <SummarySection title="Overview" content={summary.overview} />
                    <SummarySection title="Key Topics" content={summary.key_topics} />
                    <SummarySection title="Definitions" content={summary.definitions} />
                    <SummarySection title="Takeaways" content={summary.takeaways} />
                    <SummarySection title="Outline" content={summary.outline} />
                  </div>
                ) : (
                  <p className="empty-text">No summary preview available yet.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="number" value={value} step={step} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-card">
      <div className="status-card-label">{label}</div>
      <div className="status-card-value">{value}</div>
    </div>
  );
}

function SummarySection({
  title,
  content,
}: {
  title: string;
  content: string | Array<string | Record<string, unknown>> | undefined;
}) {
  return (
    <section className="summary-section">
      <h3 className="summary-section-title">{title}</h3>
      {typeof content === "string" ? (
        <p className="summary-body">{content}</p>
      ) : Array.isArray(content) && content.length > 0 ? (
        <ul className="summary-list">
          {content.map((item, index) => (
            <li key={`${title}-${index}`} className="summary-list-item">
              {typeof item === "string" ? item : formatSummaryObject(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">Not available.</p>
      )}
    </section>
  );
}

function formatSummaryObject(value: Record<string, unknown>) {
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" | ");
}

async function loadJobDetails(currentJobId: string) {
  const [jobPayload, artifactPayload] = await Promise.all([
    requestJson<JobStatus>(`/api/jobs/${currentJobId}`, {
      errorMessage: "Failed to load job details.",
    }),
    requestJson<ArtifactAvailability>(`/api/jobs/${currentJobId}/artifacts`, {
      errorMessage: "Failed to load job artifacts.",
    }),
  ]);

  return { jobPayload, artifactPayload };
}

async function loadSummary(
  currentJobId: string,
  options: {
    silentNotFound?: boolean;
    setSummary: (value: StructuredSummary | null) => void;
    setSummaryMessage: (value: string) => void;
  },
) {
  const response = await fetch(buildApiUrl(`/api/jobs/${currentJobId}/summary.json`));

  if (response.status === 404) {
    options.setSummary(null);
    if (!options.silentNotFound) {
      options.setSummaryMessage("Summary is not available yet.");
    }
    return;
  }

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load summary preview."));
  }

  const summaryPayload = (await response.json()) as StructuredSummary;
  options.setSummary(summaryPayload);
  options.setSummaryMessage("");
}

async function checkSummaryPdf(currentJobId: string, setSummaryPdfAvailable: (value: boolean) => void) {
  const response = await fetch(buildApiUrl(`/api/jobs/${currentJobId}/summary.pdf`), {
    method: "HEAD",
  });
  setSummaryPdfAvailable(response.ok);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function buildApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit & { errorMessage?: string },
): Promise<T> {
  const response = await fetch(buildApiUrl(path), init);
  if (!response.ok) {
    throw new Error(await readApiError(response, init?.errorMessage ?? "Request failed."));
  }
  return (await response.json()) as T;
}

async function readApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Ignore JSON parsing errors and fall back to default message.
  }

  return fallbackMessage;
}
