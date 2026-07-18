export type JobStatus =
  | "idle"
  | "uploading"
  | "queued"
  | "parsing"
  | "formatting"
  | "generating"
  | "done"
  | "error";

export type Chapter = {
  title: string;
  start_seconds: number;
  end_seconds: number | null;
  kind: "part" | "section" | "subsection" | string;
  word_count: number;
};

export type TexVoiceLibraryItem = {
  slug: string;
  title: string;
  source_filename: string | null;
  pdf_filename: string | null;
  audio_filename: string | null;
  chapters_filename: string | null;
  highlight_map_filename: string | null;
  source_url: string | null;
  pdf_url: string | null;
  audio_url: string | null;
  chapters_json_url: string | null;
  highlight_map_url: string | null;
};

export type ActiveDocument =
  | {
      kind: "generated";
      title: string;
      audioUrl?: string;
      scriptUrl?: string;
      sourceUrl?: string;
      pdfUrl?: string;
      chaptersJsonUrl?: string;
      logUrl?: string;
      highlightMapUrl?: string;
    }
  | {
      kind: "library";
      slug: string;
      title: string;
      audioUrl?: string | null;
      sourceUrl?: string | null;
      pdfUrl?: string | null;
      chaptersJsonUrl?: string | null;
      highlightMapUrl?: string | null;
    };
