import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type VideoItem = {
  id: string;
  title: string;
  url: string;
  durationSec?: number;
};

type LinkItem = {
  id: string;
  name: string;
  url: string;
  weight: number;
  active: boolean;
};

type Stats = {
  views: number;
  clicks: number;
  perVideo: Record<string, number>;
  perLink: Record<string, number>;
};

type ApiPayload = {
  videos: VideoItem[];
  links: LinkItem[];
  stats: Stats;
  settings?: {
    rotateEverySec?: number;
    promptAfterSec?: number;
  };
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

const fallbackVideos: VideoItem[] = [
  {
    id: "v1",
    title: "Night City Drive",
    url: "https://cdn.coverr.co/videos/coverr-night-traffic-in-a-city-1579/1080p.mp4",
    durationSec: 11,
  },
  {
    id: "v2",
    title: "Coffee Pour Slow Motion",
    url: "https://cdn.coverr.co/videos/coverr-barista-making-coffee-1560/1080p.mp4",
    durationSec: 12,
  },
  {
    id: "v3",
    title: "Beach Drone View",
    url: "https://cdn.coverr.co/videos/coverr-beautiful-coastline-1576/1080p.mp4",
    durationSec: 10,
  },
];

const fallbackLinks: LinkItem[] = [
  {
    id: "l1",
    name: "Promo Partner A",
    url: "https://example.com",
    weight: 50,
    active: true,
  },
  {
    id: "l2",
    name: "Affiliate Partner B",
    url: "https://example.org",
    weight: 50,
    active: true,
  },
];

const emptyStats: Stats = {
  views: 0,
  clicks: 0,
  perVideo: {},
  perLink: {},
};

function pickWeightedLink(links: LinkItem[]) {
  const active = links.filter((item) => item.active);
  const totalWeight = active.reduce((sum, item) => sum + Math.max(item.weight, 1), 0);
  if (!active.length || totalWeight <= 0) {
    return undefined;
  }

  let randomValue = Math.random() * totalWeight;
  for (const link of active) {
    randomValue -= Math.max(link.weight, 1);
    if (randomValue <= 0) {
      return link;
    }
  }

  return active[active.length - 1];
}

function App() {
  const [videos, setVideos] = useState<VideoItem[]>(fallbackVideos);
  const [links, setLinks] = useState<LinkItem[]>(fallbackLinks);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const [nextLink, setNextLink] = useState<LinkItem | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [apiOnline, setApiOnline] = useState(false);
  const [rotateEverySec, setRotateEverySec] = useState(11);
  const [promptAfterSec, setPromptAfterSec] = useState(8);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkWeight, setLinkWeight] = useState(50);
  const sessionIdRef = useRef(`sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const currentVideo = videos[currentVideoIndex] ?? videos[0];
  const totalWeight = useMemo(
    () => links.filter((link) => link.active).reduce((sum, link) => sum + Math.max(link.weight, 1), 0),
    [links]
  );

  const trackView = useCallback(
    async (videoId: string) => {
      if (apiOnline) {
        try {
          await fetch(`${API_BASE}/api/events/view`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId, sessionId: sessionIdRef.current }),
          });
          return;
        } catch {
          setApiOnline(false);
        }
      }

      setStats((prev) => ({
        ...prev,
        views: prev.views + 1,
        perVideo: {
          ...prev.perVideo,
          [videoId]: (prev.perVideo[videoId] ?? 0) + 1,
        },
      }));
    },
    [apiOnline]
  );

  const refreshDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/config`);
      if (!response.ok) {
        throw new Error("API unavailable");
      }
      const payload = (await response.json()) as ApiPayload;
      setVideos(payload.videos.length ? payload.videos : fallbackVideos);
      setLinks(payload.links.length ? payload.links : fallbackLinks);
      setStats(payload.stats ?? emptyStats);
      setRotateEverySec(payload.settings?.rotateEverySec ?? 11);
      setPromptAfterSec(payload.settings?.promptAfterSec ?? 8);
      setApiOnline(true);
    } catch {
      setApiOnline(false);
      setVideos(fallbackVideos);
      setLinks(fallbackLinks);
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    if (!currentVideo) {
      return;
    }
    void trackView(currentVideo.id);
  }, [currentVideo?.id, trackView]);

  useEffect(() => {
    if (!videos.length) {
      return;
    }
    const interval = window.setInterval(() => {
      setCurrentVideoIndex((prev) => (prev + 1) % videos.length);
    }, rotateEverySec * 1000);

    return () => window.clearInterval(interval);
  }, [videos.length, rotateEverySec]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      let pickedLink: LinkItem | null = pickWeightedLink(links) ?? null;

      if (apiOnline) {
        try {
          const response = await fetch(`${API_BASE}/api/next-link`);
          if (response.ok) {
            const data = (await response.json()) as { link: LinkItem | null };
            pickedLink = data.link;
          }
        } catch {
          setApiOnline(false);
        }
      }

      if (pickedLink) {
        setNextLink(pickedLink);
        setShowPrompt(true);
        setCountdown(5);
      }
    }, promptAfterSec * 1000);

    return () => window.clearTimeout(timeout);
  }, [currentVideoIndex, links, apiOnline, promptAfterSec]);

  useEffect(() => {
    if (!showPrompt || countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [showPrompt, countdown]);

  const handleOpenMonetizationLink = useCallback(async () => {
    if (!nextLink) {
      return;
    }

    let targetUrl = nextLink.url;

    if (apiOnline) {
      try {
        const response = await fetch(`${API_BASE}/api/events/click`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkId: nextLink.id,
            sessionId: sessionIdRef.current,
            source: "modal",
          }),
        });

        if (response.ok) {
          const result = (await response.json()) as { redirectUrl: string };
          targetUrl = result.redirectUrl;
        }
      } catch {
        setApiOnline(false);
      }
    }

    setStats((prev) => ({
      ...prev,
      clicks: prev.clicks + 1,
      perLink: {
        ...prev.perLink,
        [nextLink.id]: (prev.perLink[nextLink.id] ?? 0) + 1,
      },
    }));

    setShowPrompt(false);
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, [nextLink, apiOnline]);

  const handleOpenPrompt = useCallback(async () => {
    if (nextLink) {
      setShowPrompt(true);
      return;
    }

    const picked = pickWeightedLink(links) ?? null;
    setNextLink(picked);
    setShowPrompt(Boolean(picked));
  }, [nextLink, links]);

  const handleAddVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!videoTitle.trim() || !videoUrl.trim()) {
      return;
    }

    const newVideo: VideoItem = {
      id: crypto.randomUUID(),
      title: videoTitle.trim(),
      url: videoUrl.trim(),
      durationSec: rotateEverySec,
    };

    if (apiOnline) {
      try {
        await fetch(`${API_BASE}/api/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newVideo),
        });
        await refreshDashboard();
      } catch {
        setApiOnline(false);
        setVideos((prev) => [...prev, newVideo]);
      }
    } else {
      setVideos((prev) => [...prev, newVideo]);
    }

    setVideoTitle("");
    setVideoUrl("");
  };

  const handleAddLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!linkName.trim() || !linkUrl.trim()) {
      return;
    }

    const newLink: LinkItem = {
      id: crypto.randomUUID(),
      name: linkName.trim(),
      url: linkUrl.trim(),
      weight: Math.max(1, linkWeight),
      active: true,
    };

    if (apiOnline) {
      try {
        await fetch(`${API_BASE}/api/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newLink),
        });
        await refreshDashboard();
      } catch {
        setApiOnline(false);
        setLinks((prev) => [...prev, newLink]);
      }
    } else {
      setLinks((prev) => [...prev, newLink]);
    }

    setLinkName("");
    setLinkUrl("");
    setLinkWeight(50);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="relative flex min-h-screen items-end overflow-hidden px-6 py-14 sm:px-12">
        <AnimatePresence mode="wait">
          <motion.video
            key={currentVideo?.id}
            className="absolute inset-0 h-full w-full object-cover"
            src={currentVideo?.url}
            autoPlay
            muted
            loop
            playsInline
            initial={{ opacity: 0.1, scale: 1.05 }}
            animate={{ opacity: 0.8, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/85" />

        <motion.div
          className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <p className="text-sm tracking-[0.2em] text-cyan-300">FLOWSPARK MEDIA ENGINE</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Auto traffic funnel yang tetap cepat, terukur, dan siap dioptimasi.
          </h1>
          <p className="max-w-2xl text-base text-zinc-200 sm:text-lg">
            Video autoplay, rotator konten, dan distribusi link A/B test terintegrasi untuk membantu kamu
            menguji performa campaign secara real-time.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleOpenPrompt()}
              className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-300"
            >
              Mulai Monetisasi
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: window.innerHeight, behavior: "smooth" })}
              className="rounded-md border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300 hover:text-cyan-200"
            >
              Buka Dashboard
            </button>
          </div>
          <p className="text-xs text-zinc-300">
            Sekarang diputar: <span className="font-medium text-zinc-100">{currentVideo?.title}</span>
          </p>
        </motion.div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 sm:px-12 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-2xl font-semibold">Kontrol Video Rotator</h2>
          <p className="text-sm text-zinc-300">
            Tambahkan video viral untuk memaksimalkan watch time. Sistem akan memutar dan mengganti video
            otomatis setiap {rotateEverySec} detik.
          </p>

          <form className="space-y-3" onSubmit={handleAddVideo}>
            <input
              value={videoTitle}
              onChange={(event) => setVideoTitle(event.target.value)}
              placeholder="Judul video"
              className="w-full rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm outline-none ring-cyan-300 transition focus:ring"
            />
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="URL video MP4"
              className="w-full rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm outline-none ring-cyan-300 transition focus:ring"
            />
            <button
              type="submit"
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Simpan Video
            </button>
          </form>

          <ul className="space-y-2 text-sm text-zinc-200">
            {videos.map((video, index) => (
              <li key={video.id} className="flex items-center justify-between border-b border-white/10 py-2">
                <span>
                  {index + 1}. {video.title}
                </span>
                <span className="text-xs text-zinc-400">{stats.perVideo[video.id] ?? 0} views</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-5">
          <h2 className="text-2xl font-semibold">A/B Link Distribution</h2>
          <p className="text-sm text-zinc-300">
            Tambahkan beberapa link monetisasi, lalu sistem memilih link secara acak berbobot untuk mencari
            konversi terbaik.
          </p>

          <form className="space-y-3" onSubmit={handleAddLink}>
            <input
              value={linkName}
              onChange={(event) => setLinkName(event.target.value)}
              placeholder="Nama campaign"
              className="w-full rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm outline-none ring-cyan-300 transition focus:ring"
            />
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="URL redirect"
              className="w-full rounded-md border border-white/20 bg-black/30 px-4 py-2 text-sm outline-none ring-cyan-300 transition focus:ring"
            />
            <div className="flex items-center gap-3">
              <label htmlFor="weight" className="text-sm text-zinc-300">
                Bobot
              </label>
              <input
                id="weight"
                type="range"
                min={1}
                max={100}
                value={linkWeight}
                onChange={(event) => setLinkWeight(Number(event.target.value))}
                className="w-full"
              />
              <span className="w-10 text-right text-sm">{linkWeight}</span>
            </div>
            <button
              type="submit"
              className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-300"
            >
              Simpan Link
            </button>
          </form>

          <ul className="space-y-2 text-sm text-zinc-200">
            {links.map((link) => (
              <li key={link.id} className="border-b border-white/10 py-2">
                <div className="flex items-center justify-between">
                  <span>{link.name}</span>
                  <span className="text-xs text-zinc-400">{stats.perLink[link.id] ?? 0} clicks</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Weight share: {totalWeight > 0 ? Math.round((link.weight / totalWeight) * 100) : 0}%
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-10 sm:px-12">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-zinc-300">
          <p>API status: {apiOnline ? "Connected to Node/Express" : "Offline mode (frontend fallback)"}</p>
          <p>
            Views: <span className="font-semibold text-white">{stats.views}</span> | Clicks:{" "}
            <span className="font-semibold text-white">{stats.clicks}</span>
          </p>
        </div>
      </section>

      <AnimatePresence>
        {showPrompt && nextLink && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-full max-w-md rounded-lg border border-white/20 bg-zinc-950 p-6"
            >
              <p className="text-xs tracking-[0.16em] text-cyan-300">READY TO CONTINUE</p>
              <h3 className="mt-2 text-xl font-semibold">Lanjut ke halaman partner</h3>
              <p className="mt-2 text-sm text-zinc-300">
                Link dipilih dengan sistem A/B testing. Kamu bisa lanjut manual sekarang atau tunggu {countdown} detik.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenMonetizationLink}
                  className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-300"
                >
                  Buka Link
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrompt(false)}
                  className="rounded-md border border-white/30 px-4 py-2 text-sm font-semibold text-white"
                >
                  Nanti
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
