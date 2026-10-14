import { useMemo, useState } from "react";
import { zipSync } from "fflate";

type LocalImage = {
  id: string;
  name: string;
  file: File;
  url: string;
};

type Shot = {
  id: string;
  name: string;
  lens: string;
  action: string;
  prop: string;
  expression: string;
};

type Job = {
  logo: LocalImage;
  garment: LocalImage;
  product?: string;
  hero?: string;
  scene?: string;
  outfit?: string;
  shots: Shot[];
  subs: Record<string, string>;
  step: "idle" | "product" | "style" | "plan" | "hero" | "sub" | "done" | "error";
  error?: string;
};

type Phase = "idle" | "product" | "style" | "plan" | "generate" | "done";

const PHASES = [
  { id: "product", label: "产品图" },
  { id: "style", label: "穿搭规划" },
  { id: "plan", label: "规划镜头" },
  { id: "generate", label: "调生图" },
] as const;

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stem(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_").trim() || "未命名";
}

async function pickFiles(multiple = true): Promise<File[]> {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = multiple;
  input.click();
  return await new Promise((resolve) => {
    input.onchange = () => resolve([...input.files || []]);
  });
}

function toLocal(files: File[]): LocalImage[] {
  return files.map((file) => ({
    id: uid(),
    name: file.name,
    file,
    url: URL.createObjectURL(file),
  }));
}

async function dataUrlToFile(dataUrl: string, name: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || `请求失败 ${response.status}`);
  }
  return payload;
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

async function postImage(path: string, body: FormData) {
  const response = await fetch(path, { method: "POST", body });
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "生图失败");
  return payload.image as string;
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

async function imageToBytes(image: string) {
  if (image.startsWith("data:")) {
    const base64 = image.slice(image.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const response = await fetch(image);
  if (!response.ok) throw new Error("下载图片失败");
  return new Uint8Array(await response.arrayBuffer());
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function patchJob(jobs: Job[], logoId: string, garmentId: string, patch: Partial<Job>) {
  return jobs.map((item) => item.logo.id === logoId && item.garment.id === garmentId ? { ...item, ...patch } : item);
}

export default function App() {
  const [logos, setLogos] = useState<LocalImage[]>([]);
  const [garments, setGarments] = useState<LocalImage[]>([]);
  const [models, setModels] = useState<LocalImage[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [zipping, setZipping] = useState(false);
  const [activeLogoId, setActiveLogoId] = useState<string>("");
  const running = phase !== "idle" && phase !== "done";

  const pairs = useMemo(
    () => logos.flatMap((logo) => garments.map((garment) => ({ logo, garment }))),
    [logos, garments],
  );

  const jobMap = useMemo(() => {
    const map = new Map<string, Job>();
    for (const job of jobs) map.set(`${job.logo.id}:${job.garment.id}`, job);
    return map;
  }, [jobs]);

  const activeLogo = logos.find((item) => item.id === activeLogoId) || logos[0];

  const addLogos = async () => {
    const files = await pickFiles();
    if (!files.length) return;
    const added = toLocal(files);
    setLogos((prev) => {
      const next = [...prev, ...added];
      if (!activeLogoId) setActiveLogoId(next[0].id);
      return next;
    });
  };
  const addGarments = async () => {
    const files = await pickFiles();
    if (!files.length) return;
    setGarments((prev) => [...prev, ...toLocal(files)]);
  };
  const addModels = async () => {
    const files = await pickFiles();
    if (!files.length) return;
    setModels((prev) => [...prev, ...toLocal(files)]);
  };

  const appendModels = (body: FormData) => {
    for (const item of models) body.append("model", item.file);
  };

  const start = async () => {
    if (!pairs.length || !models.length || running) return;
    const nextJobs: Job[] = pairs.map(({ logo, garment }) => ({ logo, garment, shots: [], subs: {}, step: "idle" }));
    const products = new Map<string, string>();
    const styles = new Map<string, { scene: string; outfit: string }>();
    const plans = new Map<string, { scene: string; outfit: string; shots: Shot[] }>();
    const heroes = new Map<string, string>();
    setJobs(nextJobs);
    try {
      setPhase("product");
      await runPool(nextJobs, 2, async (job) => {
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { step: "product" }));
        const body = new FormData();
        body.set("logo", job.logo.file);
        body.set("garment", job.garment.file);
        const product = await postImage("/api/product", body);
        products.set(`${job.logo.id}:${job.garment.id}`, product);
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { product, step: "idle" }));
      });

      setPhase("style");
      await runPool(nextJobs, 2, async (job) => {
        const key = `${job.logo.id}:${job.garment.id}`;
        const product = products.get(key);
        if (!product) throw new Error("缺少产品图");
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { step: "style" }));
        const styleBody = new FormData();
        appendModels(styleBody);
        styleBody.set("product", await dataUrlToFile(product, "product.png"));
        const styleRes = await readJson(await fetch("/api/style", { method: "POST", body: styleBody }));
        if (!styleRes.scene || !styleRes.outfit) throw new Error("穿搭规划结果为空");
        styles.set(key, { scene: styleRes.scene, outfit: styleRes.outfit });
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, {
          scene: styleRes.scene,
          outfit: styleRes.outfit,
          step: "plan",
        }));
      });

      setPhase("plan");
      await runPool(nextJobs, 2, async (job) => {
        const key = `${job.logo.id}:${job.garment.id}`;
        const style = styles.get(key);
        if (!style?.scene || !style?.outfit) throw new Error("缺少穿搭规划");
        const planRes = await postJson("/api/plan", { scene: style.scene, outfit: style.outfit });
        plans.set(key, { ...style, shots: planRes.shots });
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { shots: planRes.shots, step: "idle" }));
      });

      setPhase("generate");
      await runPool(nextJobs, 2, async (job) => {
        const key = `${job.logo.id}:${job.garment.id}`;
        const product = products.get(key);
        const plan = plans.get(key);
        if (!product || !plan) throw new Error("缺少产品图或规划");
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { step: "hero" }));
        const heroBody = new FormData();
        appendModels(heroBody);
        heroBody.set("product", await dataUrlToFile(product, "product.png"));
        heroBody.set("scene", plan.scene);
        heroBody.set("outfit", plan.outfit);
        const hero = await postImage("/api/hero", heroBody);
        heroes.set(key, hero);
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { hero, step: "idle" }));
      });

      await runPool(nextJobs, 2, async (job) => {
        const key = `${job.logo.id}:${job.garment.id}`;
        const plan = plans.get(key);
        const hero = heroes.get(key);
        if (!plan || !hero) throw new Error("缺少主图或规划");
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { step: "sub" }));
        const subs: Record<string, string> = {};
        const heroFile = await dataUrlToFile(hero, "hero.png");
        for (const shot of plan.shots) {
          const subBody = new FormData();
          subBody.set("hero", heroFile);
          subBody.set("scene", plan.scene);
          subBody.set("outfit", plan.outfit);
          subBody.set("lens", shot.lens);
          subBody.set("action", shot.action);
          subBody.set("prop", shot.prop);
          subBody.set("expression", shot.expression);
          subs[shot.id] = await postImage("/api/sub", subBody);
          setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { subs: { ...subs } }));
        }
        setJobs((prev) => patchJob(prev, job.logo.id, job.garment.id, { step: "done", subs }));
      });
      setPhase("done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "流程失败";
      setJobs((prev) => prev.map((item) => item.step === "done" ? item : { ...item, step: "error", error: message }));
      setPhase("idle");
    }
  };

  const collectFiles = async (source: Job[], withLogoFolder: boolean) => {
    const files: Record<string, Uint8Array> = {};
    for (const job of source) {
      const prefix = withLogoFolder
        ? `${stem(job.logo.name)}/${stem(job.garment.name)}`
        : stem(job.garment.name);
      if (job.product) files[`${prefix}/商品图.png`] = await imageToBytes(job.product);
      if (job.hero) files[`${prefix}/主图.png`] = await imageToBytes(job.hero);
      for (const shot of job.shots) {
        if (job.subs[shot.id]) files[`${prefix}/${shot.name}.png`] = await imageToBytes(job.subs[shot.id]);
      }
    }
    return files;
  };

  const downloadZip = async (source: Job[], name: string, withLogoFolder: boolean) => {
    if (!source.length || zipping) return;
    setZipping(true);
    try {
      const files = await collectFiles(source, withLogoFolder);
      if (!Object.keys(files).length) return;
      const zipped = zipSync(files);
      downloadBlob(new Blob([new Uint8Array(zipped)], { type: "application/zip" }), name);
    } finally {
      setZipping(false);
    }
  };

  const logoStats = (logoId: string) => {
    const items = jobs.filter((job) => job.logo.id === logoId);
    const total = garments.length || 1;
    const subTotal = items.reduce((sum, job) => sum + (job.shots.length || 5), 0) || total * 5;
    return {
      product: items.filter((job) => job.product).length,
      hero: items.filter((job) => job.hero).length,
      sub: items.reduce((sum, job) => sum + Object.keys(job.subs).length, 0),
      total,
      subTotal,
    };
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-xs tracking-[0.28em] text-[var(--mute)] uppercase">Ecom Product Studio</p>
          <h1 className="display mt-2 text-4xl font-medium tracking-tight">商品图工坊</h1>
          <p className="mt-3 max-w-2xl text-[var(--mute)]">
            Logo + 服装 → 产品图 → 多张模特参考做穿搭规划 → 规划镜头动作表情 → 主图/副图
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => downloadZip(jobs, "商品图全量.zip", true)}
            disabled={!jobs.some((job) => job.product || job.hero) || zipping}
            className="rounded-full border border-[var(--ink)] px-5 py-3 text-sm disabled:opacity-40"
          >
            {zipping ? "打包中…" : "全量下载"}
          </button>
          <button
            onClick={start}
            disabled={!pairs.length || !models.length || running}
            className="rounded-full bg-[var(--ink)] px-6 py-3 text-sm text-[var(--paper)] disabled:opacity-40"
          >
            {running ? "生成中…" : "开始生成"}
          </button>
        </div>
      </header>

      <ol className="mb-8 flex flex-wrap gap-2 text-sm">
        {PHASES.map((item) => (
          <li
            key={item.id}
            className={`rounded-full px-3 py-1 ${phase === item.id ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[#efe4d4] text-[var(--mute)]"}`}
          >
            {item.label}
          </li>
        ))}
      </ol>

      <div className="grid gap-5 md:grid-cols-3">
        <DropCard title="Logo / 印花" hint="每个都会套全部实拍" count={logos.length} onAdd={addLogos} items={logos} activeId={activeLogo?.id} onSelect={setActiveLogoId} onRemove={(id) => setLogos((prev) => prev.filter((item) => item.id !== id))} />
        <DropCard title="服装实拍" hint="与每个 Logo 组合" count={garments.length} onAdd={addGarments} items={garments} onRemove={(id) => setGarments((prev) => prev.filter((item) => item.id !== id))} />
        <DropCard title="模特参考" hint="同一人多角度，识脸和场景" count={models.length} onAdd={addModels} items={models} onRemove={(id) => setModels((prev) => prev.filter((item) => item.id !== id))} />
      </div>

      {activeLogo && garments.length ? (() => {
        const detail = jobs.find((item) => item.logo.id === activeLogo.id && (item.outfit || item.shots.length));
        if (!detail?.outfit && !detail?.shots.length) return null;
        return (
          <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 text-sm">
            {detail.outfit ? <p className="text-[var(--mute)]"><span className="font-medium text-[var(--ink)]">穿搭：</span>{detail.outfit}</p> : null}
            {detail.scene ? <p className="mt-2 text-[var(--mute)]"><span className="font-medium text-[var(--ink)]">场景：</span>{detail.scene}</p> : null}
            {detail.shots.length ? (
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {detail.shots.map((shot) => (
                  <li key={shot.id} className="rounded-xl bg-[#fff6ea] px-3 py-2">
                    <span className="font-medium">{shot.name}</span> · {shot.lens} · {shot.action} · {shot.expression}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })() : null}

      <section className="mt-8 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="display text-2xl">Logo 进度</h2>
        </div>
        {!logos.length ? (
          <p className="px-5 py-16 text-center text-[var(--mute)]">先上传 Logo、实拍和模特图</p>
        ) : (
          <ul>
            {logos.map((logo) => {
              const stats = logoStats(logo.id);
              const selected = activeLogo?.id === logo.id;
              return (
                <li key={logo.id} className={`border-b border-[var(--line)] last:border-b-0 ${selected ? "bg-[#fff6ea]" : ""}`}>
                  <div className="flex items-center gap-4 px-5 py-4">
                    <button onClick={() => setActiveLogoId(logo.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                      <img src={logo.url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{stem(logo.name)}</div>
                        <div className="mt-1 text-xs text-[var(--mute)]">
                          产品图 {stats.product}/{stats.total} · 主图 {stats.hero}/{stats.total} · 副图 {stats.sub}/{stats.subTotal}
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efe4d4]">
                          <div
                            className="h-full bg-[var(--rust)]"
                            style={{ width: `${Math.round(((stats.product + stats.hero + stats.sub) / (stats.total * 2 + stats.subTotal)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => downloadZip(jobs.filter((job) => job.logo.id === logo.id), `${stem(logo.name)}.zip`, false)}
                      disabled={zipping || !jobs.some((job) => job.logo.id === logo.id && (job.product || job.hero))}
                      className="shrink-0 rounded-full border border-[var(--ink)] px-4 py-2 text-sm disabled:opacity-40"
                    >
                      下载此 Logo
                    </button>
                  </div>
                  {selected ? (
                    <ul className="border-t border-[var(--line)] bg-white/40">
                      {garments.map((garment) => {
                        const job = jobMap.get(`${logo.id}:${garment.id}`);
                        return (
                          <li key={garment.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                            <img src={garment.url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                            <div className="min-w-0 flex-1 truncate">{stem(garment.name)}</div>
                            <span className="text-xs text-[var(--mute)]">
                              {job?.step === "product" ? "产品图生成中" : job?.step === "style" ? "穿搭规划中" : job?.step === "plan" ? "规划镜头中" : job?.step === "hero" ? "主图生成中" : job?.step === "sub" ? `副图 ${Object.keys(job.subs).length}/${job.shots.length || 5}` : job?.step === "done" ? "完成" : job?.step === "error" ? job.error : job?.product ? "待生主图" : "等待"}
                            </span>
                            {job?.product ? <img src={job.product} alt="" className="h-10 w-10 rounded object-cover" /> : null}
                            {job?.hero ? <img src={job.hero} alt="" className="h-10 w-10 rounded object-cover" /> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function DropCard({
  title,
  hint,
  count,
  onAdd,
  items,
  activeId,
  onSelect,
  onRemove,
}: {
  title: string;
  hint: string;
  count: number;
  onAdd: () => void;
  items: LocalImage[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="display text-xl">{title}</h2>
          <p className="mt-1 text-sm text-[var(--mute)]">{hint} · {count} 张</p>
        </div>
        <button onClick={onAdd} className="rounded-full border border-[var(--ink)] px-4 py-2 text-sm">
          添加
        </button>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <div key={item.id} className={`relative shrink-0 ${activeId === item.id ? "ring-2 ring-[var(--ink)] rounded-xl" : ""}`}>
            <button onClick={() => onSelect?.(item.id)} className="block overflow-hidden rounded-xl">
              <img src={item.url} alt={item.name} className="h-16 w-16 object-cover" />
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[var(--ink)] text-[10px] text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
