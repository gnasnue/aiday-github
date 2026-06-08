import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-shell">
      <div className="page-frame flex flex-col items-center justify-center min-h-screen text-center px-5">
        <div className="text-6xl mb-4">🌤️</div>
        <h1 className="text-2xl font-bold text-foreground">페이지를 찾을 수 없어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          요청하신 페이지가 존재하지 않아요.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
