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
    <header className="project-intro mb-8">
      <p className="eyebrow text-sm font-semibold uppercase tracking-[0.25em]">
        {eyebrow}
      </p>

      <h1 className="project-intro-title mt-2 text-3xl font-bold md:text-4xl">
        {title}
      </h1>

      <p className="project-intro-description mt-3 max-w-3xl leading-7">
        {description}
      </p>

      {tech.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tech.map((item) => (
            <span
              key={item}
              className="project-tech rounded-full px-3 py-1 text-xs font-medium"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
