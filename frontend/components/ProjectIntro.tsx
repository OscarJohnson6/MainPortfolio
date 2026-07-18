type ProjectIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  tech?: string[];
};

export default function ProjectIntro({
  eyebrow,
  title,
  description,
  tech = [],
}: ProjectIntroProps) {
  return (
    <header className="mb-10">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
        {eyebrow}
      </p>

      <h1 className="mt-3 text-4xl font-bold text-white md:text-5xl">
        {title}
      </h1>

      <p className="mt-4 max-w-3xl leading-8 text-slate-300">
        {description}
      </p>

      {tech.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {tech.map((item) => (
            <span
              key={item}
              className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}