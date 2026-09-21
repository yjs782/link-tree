import LinkCard from "@/componets/LinkCard";

const links = [
  {
    label: "GitHub",
    url: "https://github.com/yourname",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .3.2.66.79.55A10.51 10.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    url: "https://linkedin.com/in/yourname",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z" />
      </svg>
    ),
  },
  {
    label: "Blog",
    url: "https://yourblog.example.com",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path
          d="M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3H15l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z"
          strokeLinejoin="round"
        />
        <path d="M14 3v5h5" strokeLinejoin="round" />
        <path d="M8 13h8M8 17h5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-black sm:py-16">
      <div className="flex w-full max-w-sm flex-col items-center gap-2 text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-3xl font-semibold text-white shadow-md">
          YJ
        </div>
        <h1 className="mt-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          양준성
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          준스타게임 개발자 | 만드는 사람
        </p>
      </div>

      <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
        {links.map((link) => (
          <LinkCard key={link.label} {...link} />
        ))}
      </div>
    </main>
  );
}
