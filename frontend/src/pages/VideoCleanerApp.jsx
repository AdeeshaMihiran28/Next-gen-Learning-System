import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";









const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const DEFAULT_OPTIONS = {
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
  strict_no_cut_speech: false,
  speech_overlap_threshold_sec: 0.2,
};

export default function VideoCleanerApp() {
  return (
    <Routes>
      <Route index element={<UploadPage />} />
      <Route path="gallery" element={<LectureGalleryPage />} />
      <Route path="jobs/:job_id" element={<JobDetailsPage />} />
    </Routes>
  );
}

function UploadPage() {
  const navigate = useNavigate();
  const videoInputRef = useRef(null);
  const templateInputRef = useRef(null);
  const [videoFile, setVideoFile] = useState(null);
  const [templateFiles, setTemplateFiles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [galleryItems, setGalleryItems] = useState([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const autoStart = true;
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isUploadingTemplates, setIsUploadingTemplates] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const role = getCurrentUserRole();
  const isAdmin = role === "admin";

  useEffect(() => {
    void fetchTemplates();
    void fetchGallery();
  }, []);

  async function fetchGallery() {
    setIsLoadingGallery(true);
    try {
      const payload = await requestJson("/api/gallery", {
        errorMessage: "Failed to load lecture gallery.",
      });
      setGalleryItems(payload.items ?? []);
    } catch {
      setGalleryItems([]);
    } finally {
      setIsLoadingGallery(false);
    }
  }

  async function fetchTemplates() {
    setIsLoadingTemplates(true);
    try {
      const payload = await requestJson("/api/templates", {
        errorMessage: "Failed to load templates.",
      });
      setTemplates(payload.templates);
      setSelectedTemplateIds((current) => {
        const existing = current.filter((templateId) =>
          payload.templates.some((template) => template.template_id === templateId),
        );
        if (existing.length > 0) {
          return existing;
        }
        // Default to all templates selected so buffering detection is active by default.
        return payload.templates.map((template) => template.template_id);
      });
      setTemplateMessage("");
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : "Failed to load templates.");
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  function updateOption(name, value) {
    setOptions((current) => ({
      ...current,
      [name]:
        typeof current[name] === "number" && typeof value === "string"
          ? Number(value)
          : value,
    }));
  }

  function toggleTemplateSelection(templateId) {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((value) => value !== templateId)
        : [...current, templateId],
    );
  }

  function removeSelectedVideo() {
    setVideoFile(null);
    setErrorMessage("");
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  }

  function removeSelectedTemplateFiles() {
    setTemplateFiles([]);
    setTemplateMessage("");
    if (templateInputRef.current) {
      templateInputRef.current.value = "";
    }
  }

  async function handleTemplateUpload(event) {
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
      const payload = await requestJson("/api/templates/upload", {
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

  async function handleTemplateDelete(templateId) {
    setDeletingTemplateId(templateId);
    setTemplateMessage("");

    try {
      await requestJson(`/api/templates/${templateId}`, {
        method: "DELETE",
        errorMessage: "Template delete failed.",
      });
      setTemplates((current) => current.filter((template) => template.template_id !== templateId));
      setSelectedTemplateIds((current) => current.filter((value) => value !== templateId));
      setTemplateMessage("Template removed.");
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : "Template delete failed.");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function handleSubmit(event) {
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
      const payload = await requestJson("/api/upload", {
        method: "POST",
        body: formData,
        errorMessage: "Upload failed.",
      });
      navigate(`/video-cleaner/jobs/${payload.job_id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const cleanerStats = useMemo(() => {
    const totalDuration = galleryItems.reduce((sum, item) => sum + Number(item.duration_seconds || 0), 0);
    const totalRemoved = galleryItems.reduce((sum, item) => sum + Number(item.total_removed_seconds || 0), 0);
    const summaryCount = galleryItems.filter((item) => item.summary_pdf_url).length;

    return [
      { label: "Cleaned Lectures", value: String(galleryItems.length), detail: "Saved gallery outputs" },
      { label: "Lecture Time", value: formatSeconds(totalDuration), detail: "Total processed duration" },
      { label: "Removed Time", value: formatSeconds(totalRemoved), detail: "Low-value content removed" },
      { label: "Summary PDFs", value: String(summaryCount), detail: `${templates.length} template${templates.length === 1 ? "" : "s"} ready` },
    ];
  }, [galleryItems, templates]);

  return (
    <main className="page">
      <div className="shell">
        <header className="page-header">
          <div className="page-header-row">
            <div>
              <h1 className="page-title">Lecture Video Cleaner Dashboard</h1>
              <p className="page-intro">
                Monitor cleaner outputs, manage buffering templates, and start new lecture processing jobs.
              </p>
            </div>
            {!isAdmin ? (
              <Link to="/video-cleaner/gallery" className="button button-primary page-action">
                Lecture Video Gallery
              </Link>
            ) : null}
          </div>
        </header>

        <div className="stack">
          {isAdmin ? (
            <>
              <CleanerAdminOverview
                galleryItems={galleryItems}
                stats={cleanerStats}
                isLoadingGallery={isLoadingGallery}
              />
              <EmbeddedLectureGallery
                galleryItems={galleryItems}
                isLoadingGallery={isLoadingGallery}
                onDeleted={(jobId) => setGalleryItems((current) => current.filter((entry) => entry.job_id !== jobId))}
              />
            </>
          ) : (
            <>
              <section className="panel">
                <div className="section-header">
                  <h2 className="section-title">Buffering Templates</h2>
                  {isLoadingTemplates ? <span className="helper-text">Loading templates...</span> : null}
                </div>

                <form onSubmit={handleTemplateUpload} className="subform">
                  <label className="field">
                    <span className="field-label">Template image files</span>
                    <input
                      ref={templateInputRef}
                      className="input"
                      type="file"
                      accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                      multiple
                      onChange={(event) => setTemplateFiles(Array.from(event.target.files ?? []))}
                    />
                    {templateFiles.length > 0 ? (
                      <span className="selected-file-row">
                        <span className="helper-text">{templateFiles.length} file(s) selected</span>
                        <button type="button" className="button button-danger" onClick={removeSelectedTemplateFiles}>
                          Remove
                        </button>
                      </span>
                    ) : (
                      <span className="helper-text">Accepted formats: PNG, JPG, JPEG</span>
                    )}
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
                      <div key={template.template_id} className="template-card">
                        <label className="template-selection">
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
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={deletingTemplateId === template.template_id}
                          onClick={() => handleTemplateDelete(template.template_id)}
                        >
                          {deletingTemplateId === template.template_id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <form onSubmit={handleSubmit} className="stack">
                <section className="panel">
                  <h2 className="section-title">Video Upload</h2>
                  <p className="helper-text">
                    Selected templates: {selectedTemplateIds.length > 0 ? selectedTemplateIds.join(", ") : "none"}
                  </p>

                  <label className="field">
                    <span className="field-label">Lecture video</span>
                    <input
                      ref={videoInputRef}
                      className="input"
                      type="file"
                      accept="video/*"
                      onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                    />
                    {videoFile ? (
                      <span className="selected-file-row">
                        <span className="helper-text">Selected: {videoFile.name}</span>
                        <button type="button" className="button button-danger" onClick={removeSelectedVideo}>
                          Remove
                        </button>
                      </span>
                    ) : (
                      <span className="helper-text">Choose a single video file to upload.</span>
                    )}
                  </label>

                  <div className="button-row">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setShowAdvancedSettings((current) => !current)}
                    >
                      {showAdvancedSettings ? "Close Advanced Settings" : "Advanced Settings"}
                    </button>

                    <button type="submit" disabled={isSubmitting || !videoFile} className="button button-primary">
                      {isSubmitting ? "Uploading..." : autoStart ? "Upload & Process" : "Upload Video"}
                    </button>
                  </div>
                </section>

                {showAdvancedSettings ? (
                  <section className="panel">
                    <h2 className="section-title">Advanced Settings</h2>

                    <div className="form-grid">
                      <NumberField label="Silence noise (dB)" value={options.silence_noise_db} step="1" onChange={(value) => updateOption("silence_noise_db", value)} />
                      <NumberField label="Silence min (s)" value={options.silence_d} step="0.1" onChange={(value) => updateOption("silence_d", value)} />
                      <NumberField label="Black min (s)" value={options.black_d} step="0.1" onChange={(value) => updateOption("black_d", value)} />
                      <NumberField label="Black pix threshold" value={options.black_pix_th} step="0.01" onChange={(value) => updateOption("black_pix_th", value)} />
                      <NumberField label="Freeze sample FPS" value={options.freeze_sampling_fps} step="1" onChange={(value) => updateOption("freeze_sampling_fps", value)} />
                      <NumberField label="Freeze diff threshold" value={options.freeze_diff_threshold} step="0.01" onChange={(value) => updateOption("freeze_diff_threshold", value)} />
                      <NumberField label="Freeze min (s)" value={options.freeze_min_duration} step="0.1" onChange={(value) => updateOption("freeze_min_duration", value)} />
                      <NumberField label="Buffering sample FPS" value={options.buffering_sample_fps} step="1" onChange={(value) => updateOption("buffering_sample_fps", value)} />
                      <NumberField label="Buffering match threshold" value={options.buffering_match_thresh} step="0.01" onChange={(value) => updateOption("buffering_match_thresh", value)} />
                      <NumberField label="Buffering min (s)" value={options.buffering_min_d} step="0.1" onChange={(value) => updateOption("buffering_min_d", value)} />
                      <SelectField
                        label="Whisper model"
                        value={options.whisper_model}
                        onChange={(value) => updateOption("whisper_model", value)}
                        options={[
                          { label: "tiny", value: "tiny" },
                          { label: "base", value: "base" },
                          { label: "small", value: "small" },
                          { label: "medium", value: "medium" },
                          { label: "large", value: "large" },
                        ]}
                      />
                      <TextField label="Whisper language" value={options.whisper_language} onChange={(value) => updateOption("whisper_language", value)} />
                      <NumberField label="No-speech min (s)" value={options.no_speech_min_d} step="0.1" onChange={(value) => updateOption("no_speech_min_d", value)} />
                      <NumberField label="Freeze min no-speech overlap (s)" value={options.freeze_min_no_speech_overlap} step="0.1" onChange={(value) => updateOption("freeze_min_no_speech_overlap", value)} />
                      <NumberField label="Freeze force remove (s)" value={options.freeze_force_remove_sec} step="0.1" onChange={(value) => updateOption("freeze_force_remove_sec", value)} />
                      <NumberField label="Speech overlap threshold (s)" value={options.speech_overlap_threshold_sec} step="0.1" onChange={(value) => updateOption("speech_overlap_threshold_sec", value)} />
                    </div>

                    <div className="checkbox-grid">
                      <CheckboxField label="Enable freeze detection" checked={options.freeze_enabled} onChange={(value) => updateOption("freeze_enabled", value)} />
                      <CheckboxField label="Enable buffering detection" checked={options.enable_buffering_detect} onChange={(value) => updateOption("enable_buffering_detect", value)} />
                      <CheckboxField label="Strict no-cut-speech mode" checked={options.strict_no_cut_speech} onChange={(value) => updateOption("strict_no_cut_speech", value)} />
                      <CheckboxField label="Generate kept-preview video" checked={options.generate_kept_preview} onChange={(value) => updateOption("generate_kept_preview", value)} />
                    </div>
                  </section>
                ) : null}

                {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
              </form>
            </>
          )}

        </div>
      </div>
    </main>
  );
}

function CleanerAdminOverview({ galleryItems, stats, isLoadingGallery }) {
  const latestLectures = galleryItems.slice(0, 3);

  return (
    <section className="panel cleaner-dashboard">
      <div className="cleaner-dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Admin Cleaner Overview</p>
          <h2 className="dashboard-title">Cleaner operations</h2>
          <p className="dashboard-copy">
            Track lecture cleaning throughput, summary coverage, and the latest processed jobs before starting another upload.
          </p>
        </div>
        <div className="dashboard-actions">
          {latestLectures[0] ? (
            <Link to={`/video-cleaner/jobs/${latestLectures[0].job_id}`} className="button button-secondary">
              Latest Job
            </Link>
          ) : null}
        </div>
      </div>

      <div className="dashboard-stat-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="dashboard-stat-card">
            <div className="dashboard-stat-label">{stat.label}</div>
            <div className="dashboard-stat-value">{stat.value}</div>
            <div className="dashboard-stat-detail">{stat.detail}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-latest">
        <div className="section-header">
          <h3 className="section-title">Latest Cleaned Lectures</h3>
        </div>

        <div className="latest-lecture-list">
          {isLoadingGallery ? (
            <p className="empty-text">Loading cleaner dashboard...</p>
          ) : latestLectures.length === 0 ? (
            <p className="empty-text">No cleaned lectures yet. Start a new upload below.</p>
          ) : (
            latestLectures.map((item) => (
              <Link key={item.job_id} to={`/video-cleaner/jobs/${item.job_id}`} className="latest-lecture-card">
                <div>
                  <div className="latest-lecture-title">{item.title}</div>
                  <div className="helper-text">{formatDateTime(item.created_at)}</div>
                </div>
                <div className="latest-lecture-metrics">
                  <span>{formatSeconds(item.duration_seconds)}</span>
                  <span>Removed {formatSeconds(item.total_removed_seconds)}</span>
                  <span>{item.summary_pdf_url ? "PDF ready" : "Video only"}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function EmbeddedLectureGallery({ galleryItems, isLoadingGallery, onDeleted }) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2 className="section-title">Lecture Gallery</h2>
          <p className="helper-text">Saved cleaned videos are listed here automatically.</p>
        </div>
        <span className="helper-text">{galleryItems.length} saved</span>
      </div>

      {isLoadingGallery ? <p className="helper-text">Loading gallery...</p> : null}

      <div className="gallery-list">
        {!isLoadingGallery && galleryItems.length === 0 ? (
          <p className="empty-text">No cleaned lectures available yet.</p>
        ) : (
          galleryItems.map((item) => (
            <GalleryCard key={item.job_id} item={item} onDeleted={onDeleted} />
          ))
        )}
      </div>
    </section>
  );
}

function LectureGalleryPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadGallery() {
      try {
        const payload = await requestJson("/api/gallery", {
          errorMessage: "Failed to load lecture gallery.",
        });
        if (!isCancelled) {
          setItems(payload.items);
          setErrorMessage("");
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load lecture gallery.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadGallery();

    return () => {
      isCancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? items.filter((item) =>
        [item.title, item.job_id, formatDateTime(item.created_at)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : items;

  return (
    <main className="page">
      <div className="shell">
        <header className="page-header">
          <div className="page-header-row">
            <div>
              <h1 className="page-title">Lecture Gallery</h1>
              <p className="page-intro">Saved cleaned videos are listed here automatically.</p>
            </div>
            <Link to="/video-cleaner" className="button button-primary page-action">
              Upload
            </Link>
          </div>
        </header>

        <section className="panel">
          <div className="gallery-search-row">
            <input
              className="input"
              type="search"
              placeholder="Search by lecture name, job ID, or date"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span className="helper-text">
              {filteredItems.length} / {items.length}
            </span>
          </div>

          {isLoading ? <p className="helper-text">Loading gallery...</p> : null}
          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          <div className="gallery-list">
            {filteredItems.length === 0 && !isLoading ? (
              <p className="empty-text">No cleaned lectures available yet.</p>
            ) : (
              filteredItems.map((item) => (
                <GalleryCard
                  key={item.job_id}
                  item={item}
                  onDeleted={(jobId) => setItems((current) => current.filter((entry) => entry.job_id !== jobId))}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function GalleryCard({ item, onDeleted }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm("Remove this lecture from the gallery?");
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await requestJson(`/api/gallery/${item.job_id}`, {
        method: "DELETE",
        errorMessage: "Failed to remove lecture.",
      });
      onDeleted(item.job_id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to remove lecture.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <article className="gallery-card">
      <div className="gallery-card-header">
        <h2 className="gallery-title">{item.title}</h2>
        <span className="helper-text">{formatDateTime(item.created_at)}</span>
      </div>

      {item.video_url ? (
        <video className="gallery-video" src={buildApiUrl(item.video_url)} controls preload="none" />
      ) : null}

      <div className="gallery-meta">
        <span>Job: {item.job_id}</span>
        <span>Duration: {formatSeconds(item.duration_seconds)}</span>
        <span>Removed: {formatSeconds(item.total_removed_seconds)}</span>
      </div>

      <div className="button-row">
        {item.video_url ? (
          <a href={buildApiUrl(item.video_url)} className="button button-primary" download>
            Download
          </a>
        ) : null}
        <Link to={`/video-cleaner/jobs/${item.job_id}`} className="button button-secondary">
          View Details
        </Link>
        {item.summary_pdf_url ? (
          <a href={buildApiUrl(item.summary_pdf_url)} target="_blank" rel="noreferrer" className="button button-secondary">
            Summary PDF
          </a>
        ) : null}
        <button type="button" className="button button-danger" disabled={isDeleting} onClick={() => void handleDelete()}>
          {isDeleting ? "Removing..." : "Remove"}
        </button>
      </div>
    </article>
  );
}

function JobDetailsPage() {
  const { job_id } = useParams();
  const [job, setJob] = useState(null);
  const [artifactAvailability, setArtifactAvailability] = useState(null);
  const [processingReport, setProcessingReport] = useState(null);
  const [summary, setSummary] = useState(null);
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
        setProcessingReport(await loadProcessingReport(currentJobId, artifactPayload));
        setErrorMessage("");
        const summaryExists = await loadSummary(currentJobId, { silentNotFound: true, setSummary, setSummaryMessage });
        if (summaryExists) {
          await checkSummaryPdf(currentJobId, setSummaryPdfAvailable);
        } else {
          setSummaryPdfAvailable(false);
        }
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
          void loadProcessingReport(job.job_id, artifactPayload).then(setProcessingReport);
          setErrorMessage("");
        })
        .catch((error) => {
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
        artifactAvailability?.artifacts.transcript_json
          ? { label: "Transcript Log", href: artifactAvailability.artifacts.transcript_json }
          : null,
      ].filter((artifact) => artifact !== null)
    : [];

  async function handleGenerateSummary() {
    if (!job_id) {
      setSummaryMessage("Job ID is missing.");
      return;
    }

    setIsGeneratingSummary(true);
    setSummaryMessage("");

    try {
      const response = await requestJson("/api/jobs/" + job_id + "/summary", {
        method: "POST",
        errorMessage: "Failed to request summary generation.",
      });

      const summaryExists = await loadSummary(job_id, {
        silentNotFound: true,
        setSummary,
        setSummaryMessage,
      });
      if (summaryExists) {
        await checkSummaryPdf(job_id, setSummaryPdfAvailable);
      } else {
        setSummaryPdfAvailable(false);
      }

      if (response.status === "not_implemented" && response.message) {
        setSummaryMessage(response.message);
      } else if (!summaryExists) {
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

              <VerificationChecklist report={processingReport} removedPreviewUrl={artifactAvailability?.artifacts.removed_preview} />

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

function NumberField({ label, value, step, onChange }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        value={value}
        step={step}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusCard({ label, value }) {
  return (
    <div className="status-card">
      <div className="status-card-label">{label}</div>
      <div className="status-card-value">{value}</div>
    </div>
  );
}

function VerificationChecklist({ report, removedPreviewUrl }) {
  if (!report && !removedPreviewUrl) {
    return null;
  }

  const removedSegments = report?.removed_segments ?? [];
  const totalRemoved = removedSegments.reduce((total, segment) => total + Number(segment.duration ?? 0), 0);
  const videoDuration = Number(report?.duration_seconds ?? 0);
  const keptSegments = report?.kept_segments ?? [];
  const speechSegments = report?.speech_segments ?? [];
  const noSpeechSegments = report?.no_speech_segments ?? [];
  const outputLabel = report?.output_valid === true ? "Passed" : report?.output_valid === false ? "Failed" : "Pending";
  const checklistItems = [
    { label: "Output validation", value: outputLabel },
    { label: "Video duration", value: videoDuration > 0 ? `${videoDuration.toFixed(2)}s` : "Pending" },
    { label: "Total removed", value: `${totalRemoved.toFixed(2)}s` },
    { label: "Kept segments", value: String(keptSegments.length) },
    { label: "Black", value: String(report?.detections?.black?.length ?? 0) },
    { label: "Silence", value: String(report?.detections?.silence?.length ?? 0) },
    { label: "Freeze", value: String(report?.detections?.freeze?.length ?? 0) },
    { label: "Buffering", value: String(report?.detections?.buffering?.length ?? 0) },
    { label: "Speech segments", value: String(speechSegments.length) },
    { label: "No-speech gaps", value: String(noSpeechSegments.length) },
    { label: "Safety violations", value: String(report?.overlap_violations?.length ?? 0) },
    { label: "Trimmed segments", value: String(removedSegments.length) },
  ];

  return (
    <section className="verification-panel">
      <h2 className="section-title">Verification Checklist</h2>

      <div className="verification-grid">
        {checklistItems.map((item) => (
          <div key={item.label} className="verification-card">
            <div className="verification-label">{item.label}</div>
            <div className="verification-value">{item.value}</div>
          </div>
        ))}
      </div>

      {removedPreviewUrl ? (
        <div className="preview-block">
          <h3 className="preview-title">Removed Parts Video</h3>
          <p className="helper-text">Preview of segments removed from the cleaned video.</p>
          <video className="preview-video" src={buildApiUrl(removedPreviewUrl)} controls />
        </div>
      ) : null}
    </section>
  );
}

function SummarySection({ title, content }) {
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

function formatSummaryObject(value) {
  return Object.entries(value)
    .filter(([key]) => key !== "time_range")
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" | ");
}

async function loadJobDetails(currentJobId) {
  const artifactPayload = await requestJson(`/api/jobs/${currentJobId}/artifacts`, {
    errorMessage: "Failed to load job artifacts.",
  });

  try {
    const jobPayload = await requestJson(`/api/jobs/${currentJobId}`, {
      errorMessage: "Failed to load job details.",
    });
    return { jobPayload, artifactPayload };
  } catch (error) {
    const fallbackJob = await buildPersistedJobFallback(currentJobId, artifactPayload);
    if (fallbackJob) {
      return { jobPayload: fallbackJob, artifactPayload };
    }
    throw error;
  }
}

async function buildPersistedJobFallback(currentJobId, artifactPayload) {
  const report = await loadProcessingReport(currentJobId, artifactPayload);
  const galleryItem = await findGalleryItem(currentJobId);
  const timestamp = galleryItem?.created_at || new Date().toISOString();

  if (!galleryItem && !artifactPayload?.artifacts?.cleaned) {
    return null;
  }

  return {
    job_id: currentJobId,
    status: "done",
    progress: 100,
    created_at: report?.created_at || timestamp,
    updated_at: report?.completed_at || timestamp,
    logs: report?.logs?.length
      ? report.logs
      : [
          "This completed job was restored from saved artifacts.",
          "Live processing logs are unavailable because the in-memory job state was cleared.",
        ],
    output_url: artifactPayload?.artifacts?.cleaned || galleryItem?.video_url || null,
    error_message: null,
  };
}

async function findGalleryItem(currentJobId) {
  try {
    const payload = await requestJson("/api/gallery", {
      errorMessage: "Failed to load lecture gallery.",
    });
    return (payload.items || []).find((item) => item.job_id === currentJobId) || null;
  } catch {
    return null;
  }
}

async function loadProcessingReport(currentJobId, artifactPayload) {
  if (!artifactPayload.artifacts.report) {
    return null;
  }

  try {
    return await requestJson(`/api/jobs/${currentJobId}/report`, {
      errorMessage: "Failed to load verification report.",
    });
  } catch {
    return null;
  }
}

async function loadSummary(currentJobId, options) {
  const response = await fetch(buildApiUrl(`/api/jobs/${currentJobId}/summary.json`));

  if (response.status === 404) {
    options.setSummary(null);
    if (!options.silentNotFound) {
      options.setSummaryMessage("Summary is not available yet.");
    }
    return false;
  }

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load summary preview."));
  }

  const summaryPayload = await response.json();
  options.setSummary(summaryPayload);
  options.setSummaryMessage("");
  return true;
}

async function checkSummaryPdf(currentJobId, setSummaryPdfAvailable) {
  const response = await fetch(buildApiUrl(`/api/jobs/${currentJobId}/summary.pdf`), {
    method: "HEAD",
  });
  setSummaryPdfAvailable(response.ok);
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function formatSeconds(value) {
  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0.00s";
  }
  return `${seconds.toFixed(2)}s`;
}

function getCurrentUserRole() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return user?.role || localStorage.getItem("userRole") || "student";
  } catch {
    return localStorage.getItem("userRole") || "student";
  }
}

function buildApiUrl(path) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

async function requestJson(path, init) {
  const response = await fetch(buildApiUrl(path), init);
  if (!response.ok) {
    throw new Error(await readApiError(response, init?.errorMessage ?? "Request failed."));
  }
  if (response.status === 204) {
    return undefined;
  }
  return await response.json();
}

async function readApiError(response, fallbackMessage) {
  try {
    const payload = await response.json();
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


