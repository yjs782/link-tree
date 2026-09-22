import LinkList from "@/componets/LinkList";

const links = [
  {
    id: "blog",
    label: "블로그",
    url: "https://blog.naver.com/shit98",
    icon: <span className="text-lg">📝</span>,
  },
  {
    id: "space-game",
    label: "우주 생존기: 100일 (웹게임)",
    url: "/space/index.html",
    icon: <span className="text-lg">🎮</span>,
  },
  {
    id: "email",
    label: "이메일",
    url: "mailto:shit98@naver.com",
    icon: <span className="text-lg">📧</span>,
  },
];

const snowflakes = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  size: Math.random() * 4 + 2,
  duration: Math.random() * 10 + 12,
  delay: Math.random() * -20,
  opacity: Math.random() * 0.5 + 0.4,
  drift: (Math.random() - 0.5) * 80,
}));

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-6 py-16 sm:px-10 sm:py-20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {snowflakes.map((flake) => (
          <span
            key={flake.id}
            className="snowflake"
            style={
              {
                left: `${flake.left}%`,
                width: `${flake.size}px`,
                height: `${flake.size}px`,
                opacity: flake.opacity,
                animationDuration: `${flake.duration}s`,
                animationDelay: `${flake.delay}s`,
                "--drift": `${flake.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <img
          src="https://placecats.com/150/150"
          alt="양스타 프로필 사진"
          width={150}
          height={150}
          className="h-[150px] w-[150px] rounded-full object-cover shadow-[0_10px_24px_rgba(120,72,40,0.28),0_2px_6px_rgba(120,72,40,0.16)] ring-4 ring-white/70"
        />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#4a3728]">
          양스타
        </h1>
        <p className="text-sm text-[#8a7160]">
          초보개발자 | 요즘에는 AI 로 웹게임을 만들고 있어
        </p>
      </div>

      <div className="relative z-10 mt-12 flex w-full max-w-sm flex-col gap-4">
        <LinkList links={links} />
      </div>
    </main>
  );
}
