type LinkCardProps = {
  label: string;
  url: string;
  icon: React.ReactNode;
};

export default function LinkCard({ label, url, icon }: LinkCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/40 px-5 py-4 shadow-[0_4px_16px_rgba(120,72,40,0.08)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/55 hover:shadow-[0_8px_20px_rgba(120,72,40,0.12)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/50 text-[#6b4f3a]">
        {icon}
      </span>
      <span className="font-medium text-[#4a3728]">{label}</span>
    </a>
  );
}
