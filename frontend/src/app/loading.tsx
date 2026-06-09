// 路由级 Suspense fallback: page.tsx 在服务端预取数据期间 (尤其后端冷启的几秒),
// Next 先流式推送这个骨架, 数据就绪再替换为真正的页面 —— 避免 force-dynamic 阻塞导致白屏。
export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* 顶栏占位 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2.5">
        <div className="h-4 w-56 rounded bg-slate-200" />
        <div className="h-7 w-20 rounded-full bg-slate-200" />
      </div>
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="h-5 w-40 rounded bg-slate-100" />
      </div>

      {/* 内容骨架 */}
      <main className="animate-pulse space-y-4 px-6 py-4" aria-busy="true" aria-label="加载中">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 h-3 w-48 rounded bg-slate-200" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 rounded-lg bg-slate-100" />
            <div className="h-16 rounded-lg bg-slate-100" />
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 h-3 w-32 rounded bg-slate-200" />
          <div className="flex items-end gap-1.5">
            {[40, 70, 30, 90, 55, 75, 45, 85, 35, 60, 50, 80].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-slate-100" style={{ height: h }} />
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 h-3 w-24 rounded bg-slate-200" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 w-full rounded bg-slate-100" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
