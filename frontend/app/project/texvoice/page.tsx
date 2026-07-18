import TexVoiceApp from "@/app/project/texvoice/TexVoiceApp";

export const metadata = {
  title: "TexVoice | OJ Builds",
  description:
    "A LaTeX and text-to-speech tool for turning notes into timestamped study audio.",
};

const tech = ["Python", "FastAPI", "React", "TypeScript", "LaTeX", "TTS"];

export default function TexVoicePage() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          Python / FastAPI / TTS
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
          TexVoice
        </h1>

        <p className="mt-4 max-w-3xl leading-8 text-slate-300">
          Convert LaTeX or plain text notes into listenable audio with generated
          timestamps, browser playback, downloadable files, and backend progress
          logs.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {tech.map((item) => (
            <span
              key={item}
              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-800"
            >
              {item}
            </span>
          ))}
        </div>
      </header>

      <TexVoiceApp />
    </section>
  );
}