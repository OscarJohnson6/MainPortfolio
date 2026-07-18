"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TexVoicePdfViewer from "./TexVoicePdfViewerClient";

type JobStatus = "idle" | "uploading" | "queued" | "parsing" | "formatting" | "generating" | "done" | "error";
type DownloadStatus = "idle" | "downloading" | "done" | "error";
type AudioMode = "auto" | "official" | "generated";

type GenerateJobResponse = {
  jobId: string;
};

type Chapter = {
  title: string;
  start_seconds: number;
  end_seconds: number | null;
  kind: "part" | "section" | "subsection" | string;
  word_count: number;
};

type JobState = {
  id: string;
  status: JobStatus;
  message: string;
  progress: number;
  word_count: number;
  estimated_minutes: number;
  estimated_audio_bytes: number;
  generated_audio_bytes: number;
  actual_audio_bytes: number;
  manifest_url?: string;
  audio_url?: string;
  script_url?: string;
  chapters_url?: string;
  chapters_json_url?: string;
  log_url?: string;
  source_url?: string;
  pdf_url?: string;
  highlight_map_url?: string;
  logs: string[];
  error?: string;
};

type LibraryItem = {
  slug: string;
  title: string;
  course?: string;
  summary?: string;
  tags?: string[];
  sourceUrl?: string | null;
  pdfUrl?: string | null;
  audioUrl?: string | null;
  chaptersUrl?: string | null;
  transcriptUrl?: string | null;
};

type LibraryResponse = {
  items: LibraryItem[];
};

type ActiveDocument = {
  kind: "generated" | "library";
  title: string;
  audioUrl?: string | null;
  chaptersUrl?: string | null;
  scriptUrl?: string | null;
  logUrl?: string | null;
  pdfUrl?: string | null;
  sourceUrl?: string | null;
  manifestUrl?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const voicePresets = [
  { label: "Aria", value: "aria" },
  { label: "Jenny", value: "jenny" },
  { label: "Ava", value: "ava" },
  { label: "Andrew", value: "andrew" },
  { label: "Brian", value: "brian" },
  { label: "Emma", value: "emma" },
];

const profiles = ["sleep", "study", "default", "fast"] as const;
const styles = ["sleep", "narrated", "literal"] as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function getFriendlyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function getFilenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").pop() ?? "texvoice-output.mp3");
  } catch {
    return "texvoice-output.mp3";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getActiveChapter(chapters: Chapter[], currentTime: number): Chapter | null {
  if (chapters.length === 0) return null;

  let active: Chapter | null = chapters[0];

  for (const chapter of chapters) {
    if (chapter.start_seconds <= currentTime) {
      active = chapter;
    } else {
      break;
    }
  }

  return active;
}

function getAcceptedFileDescription(file: File): string {
  if (file.name.toLowerCase().endsWith(".tex")) return "LaTeX source";
  if (file.name.toLowerCase().endsWith(".txt")) return "plain text";
  return "unsupported";
}

export default function TexVoiceApp() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Drop a .tex file to preview the PDF, or generate audio when ready.");
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryItem | null>(null);
  const [libraryStatus, setLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("loading");

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotalBytes, setDownloadTotalBytes] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);

  const [profile, setProfile] = useState<(typeof profiles)[number]>("sleep");
  const [style, setStyle] = useState<(typeof styles)[number]>("sleep");
  const [announceHeadings, setAnnounceHeadings] = useState(true);
  const [speakListOrdinals, setSpeakListOrdinals] = useState(true);
  const [voicePreset, setVoicePreset] = useState("aria");
  const [rate, setRate] = useState("+10%");
  const [pitch, setPitch] = useState("-7Hz");
  const [maxWords, setMaxWords] = useState("250");
  const [startAt, setStartAt] = useState("");
  const [audioMode, setAudioMode] = useState<AudioMode>("auto");

  const isBusy = ["uploading", "queued", "parsing", "formatting", "generating"].includes(status);
  const canGenerate = (file !== null || Boolean(selectedLibraryItem?.sourceUrl)) && !isBusy;
  const generateButtonLabel = file ? "Generate audio" : selectedLibraryItem?.sourceUrl ? "Generate preview audio" : "Generate audio";

  const activeDocument = useMemo<ActiveDocument | null>(() => {
    if (selectedLibraryItem) {
      return {
        kind: "library",
        title: selectedLibraryItem.title,
        audioUrl: selectedLibraryItem.audioUrl,
        chaptersUrl: selectedLibraryItem.chaptersUrl,
        pdfUrl: selectedLibraryItem.pdfUrl ?? job?.pdf_url,
        sourceUrl: selectedLibraryItem.sourceUrl,
        scriptUrl: job?.script_url,
        logUrl: job?.log_url,
        manifestUrl: job?.manifest_url,
      };
    }

    if (job?.status === "done" && (job.audio_url || job.pdf_url || job.source_url || job.script_url)) {
      return {
        kind: "generated",
        title: file?.name ?? "Generated document",
        audioUrl: job.audio_url,
        chaptersUrl: job.chapters_json_url,
        scriptUrl: job.script_url,
        logUrl: job.log_url,
        pdfUrl: job.pdf_url,
        sourceUrl: job.source_url,
        manifestUrl: job.manifest_url,
      };
    }

    return null;
  }, [file?.name, job, selectedLibraryItem]);

  const officialAudioUrl = selectedLibraryItem?.audioUrl ?? null;
  const generatedPreviewAudioUrl = selectedLibraryItem && job?.status === "done" ? job.audio_url ?? null : null;
  const officialChaptersUrl = selectedLibraryItem?.chaptersUrl ?? null;
  const generatedPreviewChaptersUrl = selectedLibraryItem && job?.status === "done" ? job.chapters_json_url ?? null : null;

  const audioUrl = selectedLibraryItem
    ? audioMode === "official"
      ? officialAudioUrl
      : audioMode === "generated"
        ? generatedPreviewAudioUrl
        : generatedPreviewAudioUrl ?? officialAudioUrl
    : activeDocument?.audioUrl ?? null;

  const activeChaptersUrl = selectedLibraryItem
    ? audioMode === "official"
      ? officialChaptersUrl
      : audioMode === "generated"
        ? generatedPreviewChaptersUrl
        : generatedPreviewChaptersUrl ?? officialChaptersUrl
    : activeDocument?.chaptersUrl ?? null;

  const hasAudioSourceToggle = Boolean(officialAudioUrl && generatedPreviewAudioUrl);
  const activeChapter = useMemo(() => getActiveChapter(chapters, currentTime), [chapters, currentTime]);

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return `${file.name} • ${getAcceptedFileDescription(file)} • ${formatBytes(file.size)}`;
  }, [file]);

  useEffect(() => {
    async function loadLibrary() {
      try {
        const response = await fetch(`${API_BASE}/api/texvoice/library`);
        if (!response.ok) throw new Error(`Could not load TexVoice archive: ${response.status}`);
        const data = (await response.json()) as LibraryResponse;
        setLibraryItems(data.items ?? []);
        setLibraryStatus("ready");
      } catch (err) {
        setLibraryItems([]);
        setLibraryStatus("error");
        setError(getFriendlyError(err));
      }
    }

    void loadLibrary();
  }, []);

  useEffect(() => {
    async function loadChapters() {
      if (!activeChaptersUrl) {
        setChapters([]);
        return;
      }

      try {
        const response = await fetch(activeChaptersUrl);
        if (!response.ok) throw new Error(`Could not load chapters: ${response.status}`);
        const data = (await response.json()) as Chapter[];
        setChapters(data);
      } catch (err) {
        setError(getFriendlyError(err));
      }
    }

    void loadChapters();
  }, [activeChaptersUrl]);

  function resetForNewFile(nextFile: File) {
    setFile(nextFile);
    setStatus("idle");
    setProgress(0);
    setJob(null);
    setSelectedLibraryItem(null);
    setChapters([]);
    setCurrentTime(0);
    setDuration(0);
    setIsAudioPlaying(false);
    setError(null);
    setDownloadStatus("idle");
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setDownloadTotalBytes(0);
    setDownloadSpeed(0);
    setAudioMode("auto");
    setStatusText(nextFile.name.toLowerCase().endsWith(".tex") ? "Preparing PDF preview..." : "Ready to generate audio.");
  }

  async function previewUploadedTex(nextFile: File) {
    if (!nextFile.name.toLowerCase().endsWith(".tex")) return;

    setStatus("formatting");
    setProgress(10);
    setError(null);
    setStatusText("Uploading LaTeX source and compiling PDF preview...");

    const formData = new FormData();
    formData.append("file", nextFile);

    try {
      const response = await fetch(`${API_BASE}/api/texvoice/preview-pdf`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `PDF preview failed with status ${response.status}`);
      }

      const data = (await response.json()) as JobState;
      setJob(data);
      setStatus(data.status);
      setProgress(data.progress);
      setStatusText(data.pdf_url ? "PDF preview ready. Generate audio when you want it." : data.message);
    } catch (err) {
      setStatus("idle");
      setProgress(0);
      setError(getFriendlyError(err));
      setStatusText("Could not compile PDF preview. You can still try generating audio.");
    }
  }

  function handleFiles(files: FileList | null) {
    const nextFile = files?.[0];
    if (!nextFile) return;

    const lower = nextFile.name.toLowerCase();
    if (!lower.endsWith(".tex") && !lower.endsWith(".txt")) {
      setError("Upload a .tex or .txt file.");
      return;
    }

    resetForNewFile(nextFile);

    if (lower.endsWith(".tex")) {
      void previewUploadedTex(nextFile);
    }
  }

  async function pollJob(jobId: string) {
    while (true) {
      const response = await fetch(`${API_BASE}/api/texvoice/jobs/${jobId}`);

      if (!response.ok) {
        throw new Error(`Failed to poll job ${jobId}: ${response.status}`);
      }

      const data = (await response.json()) as JobState;

      setJob(data);
      setStatus(data.status);
      setProgress(data.progress);
      setStatusText(data.message);

      if (data.status === "done" || data.status === "error") {
        if (data.status === "error") {
          setError(data.error ?? data.message);
        }
        return;
      }

      await sleep(900);
    }
  }

  function appendGenerationSettings(formData: FormData) {
    formData.append("profile", profile);
    formData.append("style", style);
    formData.append("voice_preset", voicePreset);
    formData.append("rate", rate);
    formData.append("pitch", pitch);
    formData.append("announce_headings", String(announceHeadings));
    formData.append("speak_list_ordinals", String(speakListOrdinals));

    if (maxWords.trim()) {
      formData.append("max_words", maxWords.trim());
    }

    if (startAt.trim()) {
      formData.append("start_at", startAt.trim());
    }
  }

  async function generateAudio() {
    if (file) {
      await generateFromUpload();
      return;
    }

    if (selectedLibraryItem?.slug && selectedLibraryItem.sourceUrl) {
      await generateFromArchive(selectedLibraryItem.slug);
    }
  }

  async function generateFromUpload() {
    if (!file) return;

    setStatus("uploading");
    setProgress(2);
    setError(null);
    setJob(null);
    setSelectedLibraryItem(null);
    setChapters([]);
    setDownloadStatus("idle");
    setCurrentTime(0);
    setDuration(0);
    setAudioMode("auto");
    setStatusText("Uploading file and creating backend job...");

    const formData = new FormData();
    formData.append("file", file);
    appendGenerationSettings(formData);

    try {
      const response = await fetch(`${API_BASE}/api/texvoice/generate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as GenerateJobResponse;
      setStatus("queued");
      setStatusText("Backend job created. Watching progress...");
      await pollJob(data.jobId);
    } catch (err) {
      setStatus("error");
      setProgress(0);
      setError(getFriendlyError(err));
      setStatusText("Generation failed.");
    }
  }

  async function generateFromArchive(slug: string) {
    setStatus("uploading");
    setProgress(2);
    setError(null);
    setJob(null);
    setChapters([]);
    setDownloadStatus("idle");
    setCurrentTime(0);
    setDuration(0);
    setAudioMode("auto");
    setStatusText("Creating temporary archive preview audio job...");

    const formData = new FormData();
    appendGenerationSettings(formData);

    try {
      const response = await fetch(`${API_BASE}/api/texvoice/library/${encodeURIComponent(slug)}/generate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as GenerateJobResponse;
      setStatus("queued");
      setStatusText("Archive preview job created. Watching progress...");
      await pollJob(data.jobId);
    } catch (err) {
      setStatus("error");
      setProgress(0);
      setError(getFriendlyError(err));
      setStatusText("Archive preview generation failed.");
    }
  }

  function selectLibraryItem(item: LibraryItem) {
    setSelectedLibraryItem(item);
    setJob(null);
    setFile(null);
    setStatus("idle");
    setProgress(0);
    setChapters([]);
    setCurrentTime(0);
    setDuration(0);
    setIsAudioPlaying(false);
    setDownloadStatus("idle");
    setAudioMode("auto");
    setStatusText(`Loaded archive example: ${item.title}.`);
    setError(null);
  }

  async function useActiveSourceAsUpload() {
    if (!activeDocument?.sourceUrl) return;

    try {
      setError(null);
      setStatusText(`Loading source for ${activeDocument.title}...`);

      const response = await fetch(activeDocument.sourceUrl);
      if (!response.ok) {
        throw new Error(`Could not load source file: ${response.status}`);
      }

      const blob = await response.blob();
      const filename = getFilenameFromUrl(activeDocument.sourceUrl);
      const nextFile = new File([blob], filename, {
        type: blob.type || "text/plain",
      });

      resetForNewFile(nextFile);
      setStatusText(`Loaded ${filename}. Adjust settings, then generate a new audio file.`);
    } catch (err) {
      setError(getFriendlyError(err));
      setStatusText("Could not load archive source as an upload.");
    }
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = seconds;
    setCurrentTime(seconds);
    void audio.play();
  }

  function toggleAudioPlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  async function downloadWithProgress(url: string, fallbackName?: string) {
    setDownloadStatus("downloading");
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setDownloadTotalBytes(0);
    setDownloadSpeed(0);

    try {
      const startedAt = performance.now();
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const contentLength = Number(response.headers.get("content-length") ?? "0");
      setDownloadTotalBytes(contentLength);

      if (!response.body) {
        throw new Error("This browser did not expose a readable download stream.");
      }

      const reader = response.body.getReader();
      const chunks: ArrayBuffer[] = [];
      let received = 0;

      while (true) {
        const { value, done } = await reader.read() as { value: Uint8Array | undefined, done: boolean };

        if (done) break;
        if (!value) continue;

        chunks.push(new Uint8Array(value).buffer);
        received += value.length;

        const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
        const averageSpeed = received / elapsedSeconds;
        const percent = contentLength > 0 ? Math.min(100, (received / contentLength) * 100) : 0;

        setDownloadedBytes(received);
        setDownloadSpeed(averageSpeed);
        setDownloadProgress(percent);
      }

      const blob = new Blob(chunks, {
        type: response.headers.get("content-type") ?? "audio/mpeg",
      });

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fallbackName ?? getFilenameFromUrl(url);
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(objectUrl);

      setDownloadStatus("done");
      setDownloadProgress(100);
    } catch (err) {
      setDownloadStatus("error");
      setError(getFriendlyError(err));
    }
  }

  const generatedBytes = job?.generated_audio_bytes ?? 0;
  const estimatedBytes = job?.estimated_audio_bytes ?? 0;
  const actualBytes = job?.actual_audio_bytes ?? 0;

  return (
    <main id="main-content" className="rounded-4xl border border-zinc-800 bg-zinc-950 px-4 py-8 text-zinc-100 shadow-2xl shadow-black/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-zinc-500">texvoice</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">LaTeX Notes to Audio</h1>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-zinc-400">
            Upload notes, generate audio, listen in-browser, and jump through timestamps without opening extra files.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="flex flex-col gap-6">
            <section
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFiles(event.dataTransfer.files);
              }}
              className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/70 p-8 shadow-2xl shadow-black/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".tex,.txt,text/plain"
                className="hidden"
                onChange={(event) => handleFiles(event.target.files)}
              />

              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-2xl bg-zinc-800 px-5 py-3 text-sm text-zinc-300">
                  {fileSummary ?? "Drop your .tex or .txt file here"}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl bg-zinc-100 px-5 py-3 font-medium text-zinc-950 transition hover:bg-white"
                >
                  Browse file
                </button>
              </div>
            </section>

            <section className="grid gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-zinc-400">Profile</span>
                <select
                  value={profile}
                  onChange={(event) => setProfile(event.target.value as (typeof profiles)[number])}
                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  {profiles.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-zinc-400">Speech style</span>
                <select
                  value={style}
                  onChange={(event) => setStyle(event.target.value as (typeof styles)[number])}
                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  {styles.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:col-span-2">
                <p className="text-sm font-medium text-zinc-200">Speech cleanup</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  These only affect generated audio/script output. PDF preview still uses the original LaTeX.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={announceHeadings}
                      onChange={(event) => setAnnounceHeadings(event.target.checked)}
                      className="mt-1 accent-emerald-300"
                    />
                    <span>
                      <span className="block font-medium text-zinc-100">Announce headings</span>
                      <span className="text-xs text-zinc-500">Say phrases like “Next topic” before section titles.</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={speakListOrdinals}
                      onChange={(event) => setSpeakListOrdinals(event.target.checked)}
                      className="mt-1 accent-emerald-300"
                    />
                    <span>
                      <span className="block font-medium text-zinc-100">Speak list numbers</span>
                      <span className="text-xs text-zinc-500">Say First, Second, Third before list items.</span>
                    </span>
                  </label>
                </div>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-zinc-400">Voice preset</span>
                <select
                  value={voicePreset}
                  onChange={(event) => setVoicePreset(event.target.value)}
                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  {voicePresets.map((voice) => (
                    <option key={voice.value} value={voice.value}>{voice.label}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-400">Rate</span>
                  <input value={rate} onChange={(event) => setRate(event.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2" />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-400">Pitch</span>
                  <input value={pitch} onChange={(event) => setPitch(event.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2" />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-400">Max words</span>
                  <input value={maxWords} onChange={(event) => setMaxWords(event.target.value)} placeholder="250" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2" />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm text-zinc-400">Start at</span>
                  <input value={startAt} onChange={(event) => setStartAt(event.target.value)} placeholder="optional" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2" />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm text-zinc-500">Status</p>
                  <p className="mt-1 font-medium">{statusText}</p>
                </div>

                <button
                  type="button"
                  disabled={!canGenerate}
                  onClick={generateAudio}
                  className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  {generateButtonLabel}
                </button>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>

              {job && (
                <div className="mt-5 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-zinc-500">Generated audio</p>
                      <p className="font-medium">{formatBytes(generatedBytes)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Estimated size</p>
                      <p className="font-medium">{formatBytes(estimatedBytes)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Final size</p>
                      <p className="font-medium">{actualBytes > 0 ? formatBytes(actualBytes) : "Not finished"}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <p className="text-zinc-400">{job.word_count?.toLocaleString() ?? 0} words • {job.estimated_minutes ?? 0} estimated minutes</p>
                    <p className="text-zinc-400 md:text-right">Job status: {job.status}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-2xl border border-red-900/70 bg-red-950/40 p-4 text-sm text-red-200">
                  {error}
                </div>
              )}
            </section>

            {activeDocument && (
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-sm text-zinc-500">{audioUrl ? "Now playing" : "Selected document"}</p>
                      <h2 className="text-2xl font-semibold">{activeChapter?.title ?? activeDocument.title}</h2>
                      {audioUrl ? (
                        <p className="mt-1 text-sm text-zinc-400">
                          {formatTimestamp(currentTime)} / {duration > 0 ? formatTimestamp(duration) : "--:--"}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-zinc-400">
                          PDF/source preview available. Audio has not been generated for this item yet.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      {audioUrl && !selectedLibraryItem && (
                        <button
                          type="button"
                          onClick={() => downloadWithProgress(audioUrl, getFilenameFromUrl(audioUrl))}
                          className="rounded-xl bg-zinc-100 px-4 py-2 font-medium text-zinc-950"
                        >
                          Download audio
                        </button>
                      )}

                      {activeDocument.scriptUrl && (
                        <a className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200" href={activeDocument.scriptUrl} target="_blank" rel="noreferrer">
                          Script
                        </a>
                      )}

                      {activeDocument.sourceUrl && (
                        <a className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200" href={activeDocument.sourceUrl} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      )}

                      {activeDocument.sourceUrl && (
                        <button
                          type="button"
                          onClick={useActiveSourceAsUpload}
                          className="rounded-xl border border-cyan-700/70 px-4 py-2 text-cyan-100 transition hover:border-cyan-400 hover:bg-cyan-400/10"
                        >
                          Use source
                        </button>
                      )}

                      {activeDocument.logUrl && (
                        <a className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200" href={activeDocument.logUrl} target="_blank" rel="noreferrer">
                          Log
                        </a>
                      )}
                    </div>
                  </div>

                  {hasAudioSourceToggle && (
                    <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
                      <button
                        type="button"
                        onClick={() => setAudioMode("official")}
                        className={`rounded-xl px-3 py-2 transition ${
                          audioMode === "official"
                            ? "bg-cyan-300 text-zinc-950"
                            : "border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                        }`}
                      >
                        Official audio
                      </button>
                      <button
                        type="button"
                        onClick={() => setAudioMode("generated")}
                        className={`rounded-xl px-3 py-2 transition ${
                          audioMode === "generated" || audioMode === "auto"
                            ? "bg-emerald-300 text-zinc-950"
                            : "border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                        }`}
                      >
                        Generated preview
                      </button>
                      <p className="self-center text-xs text-zinc-500">
                        Generated preview audio is temporary and stays in exports until cleanup.
                      </p>
                    </div>
                  )}

                  {audioUrl ? (
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      controls
                      className="w-full"
                      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                      onPlay={() => setIsAudioPlaying(true)}
                      onPause={() => setIsAudioPlaying(false)}
                      onEnded={() => setIsAudioPlaying(false)}
                    />
                  ) : (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
                      No audio is selected yet. Generate preview audio from the archive source or use the source as an upload.
                    </div>
                  )}

                  {downloadStatus !== "idle" && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex flex-wrap justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {downloadStatus === "downloading" && "Downloading audio..."}
                          {downloadStatus === "done" && "Download complete."}
                          {downloadStatus === "error" && "Download failed."}
                        </span>
                        <span className="text-zinc-400">
                          {formatBytes(downloadedBytes)}
                          {downloadTotalBytes > 0 ? ` / ${formatBytes(downloadTotalBytes)}` : ""}
                          {downloadSpeed > 0 ? ` • ${formatSpeed(downloadSpeed)}` : ""}
                        </span>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div className="h-full rounded-full bg-sky-400 transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Document preview</p>
                        <p className="text-sm text-zinc-500">PDF display now, synced highlighting later.</p>
                      </div>
                    </div>

                    {activeDocument.pdfUrl ? (
                      <TexVoicePdfViewer
                        title={activeDocument.title}
                        pdfUrl={activeDocument.pdfUrl}
                        audioUrl={audioUrl}
                        audioLabel={selectedLibraryItem ? (audioMode === "official" ? "Official archive audio" : "Generated preview audio") : "Generated audio"}
                        currentTime={currentTime}
                        duration={duration}
                        isAudioPlaying={isAudioPlaying}
                        activeChapter={activeChapter}
                        chapters={chapters}
                        onSeek={seekTo}
                        onTogglePlay={toggleAudioPlayback}
                        onPdfTextSelected={(text) => setStartAt(text)}
                      />
                    ) : (
                      <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
                        No PDF is available yet. Upload a .tex file to compile a preview, or generate audio from text without a PDF.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4">
                <p className="font-medium">Timestamps</p>
                <p className="text-sm text-zinc-500">Click a chapter to jump audio</p>
              </div>

              <div className="max-h-128 space-y-2 overflow-y-auto pr-1">
                {chapters.length === 0 && (
                  <p className="text-sm text-zinc-500">Timestamps appear after generation.</p>
                )}

                {chapters.map((chapter) => {
                  const isActive = activeChapter?.start_seconds === chapter.start_seconds && activeChapter?.title === chapter.title;

                  return (
                    <button
                      key={`${chapter.start_seconds}-${chapter.title}`}
                      type="button"
                      onClick={() => seekTo(chapter.start_seconds)}
                      className={`w-full rounded-2xl border p-3 text-left text-sm transition ${
                        isActive
                          ? "border-emerald-400 bg-emerald-400/10 text-emerald-100"
                          : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium">{chapter.title}</span>
                        <span className="shrink-0 text-zinc-500">{formatTimestamp(chapter.start_seconds)}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {chapter.kind} • {chapter.word_count} words
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4">
                <p className="font-medium">Backend activity</p>
                <p className="text-sm text-zinc-500">Live job log</p>
              </div>

              <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {!job?.logs?.length && <p className="text-sm text-zinc-500">No backend logs yet.</p>}

                {job?.logs?.slice().reverse().slice(0, 9).map((entry) => (
                  <div key={entry} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200">
                    {entry}
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4">
                <p className="font-medium">Archive examples</p>
                <p className="text-sm text-zinc-500">Imported LaTeX/PDF notes. Audio and timestamps can be added later.</p>
              </div>

              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {libraryStatus === "loading" && <p className="text-sm text-zinc-500">Loading archive...</p>}
                {libraryStatus === "ready" && libraryItems.length === 0 && (
                  <p className="text-sm text-zinc-500">No archive items yet. Add .tex/.pdf files under imports/latex.</p>
                )}
                {libraryStatus === "error" && (
                  <p className="text-sm text-red-200">Archive could not load. The generator can still run.</p>
                )}

                {libraryItems.map((item) => {
                  const isSelected = selectedLibraryItem?.slug === item.slug;

                  return (
                    <button
                      key={item.slug}
                      type="button"
                      onClick={() => selectLibraryItem(item)}
                      className={`w-full rounded-2xl border p-3 text-left text-sm transition ${
                        isSelected
                          ? "border-cyan-300 bg-cyan-300/10 text-cyan-100"
                          : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium">{item.title}</span>
                        <span className="shrink-0 text-xs text-zinc-500">{item.course ?? "Archive"}</span>
                      </div>
                      {item.summary && <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{item.summary}</p>}
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-zinc-500">
                        {item.audioUrl && <span className="rounded-full bg-zinc-900 px-2 py-1">audio</span>}
                        {item.pdfUrl && <span className="rounded-full bg-zinc-900 px-2 py-1">pdf</span>}
                        {item.chaptersUrl && <span className="rounded-full bg-zinc-900 px-2 py-1">timestamps</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

          </aside>
        </section>
      </div>
    </main>
  );
}
