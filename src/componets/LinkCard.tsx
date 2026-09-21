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
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-700 dark:text-gray-200">
        {icon}
      </span>
      <span className="font-medium text-gray-800 dark:text-gray-100">{label}</span>
    </a>
  );
}
