import { Route, Routes, useParams } from "react-router-dom";

function UploadPage() {
  return (
    <main style={pageStyle}>
      <h1>Lecture Video Cleaner</h1>
      <p>Upload page placeholder.</p>
    </main>
  );
}

function JobDetailsPage() {
  const { job_id } = useParams();

  return (
    <main style={pageStyle}>
      <h1>Job Details</h1>
      <p>Job details page placeholder for job: {job_id}</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/jobs/:job_id" element={<JobDetailsPage />} />
    </Routes>
  );
}

const pageStyle = {
  padding: "2rem",
  fontFamily: "system-ui, sans-serif",
};
