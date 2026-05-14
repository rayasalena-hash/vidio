import cors from "cors";
import express from "express";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const videos = [
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

const links = [
  { id: "l1", name: "Promo Partner A", url: "https://example.com", weight: 50, active: true },
  { id: "l2", name: "Affiliate Partner B", url: "https://example.org", weight: 50, active: true },
];

const stats = {
  views: 0,
  clicks: 0,
  perVideo: {},
  perLink: {},
};

const settings = {
  rotateEverySec: 11,
  promptAfterSec: 8,
};

function sanitizeUrl(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

function isLikelyBot(userAgent = "") {
  const lowered = userAgent.toLowerCase();
  return ["bot", "spider", "crawl", "headless", "preview"].some((keyword) => lowered.includes(keyword));
}

function pickWeightedLink() {
  const active = links.filter((item) => item.active);
  const totalWeight = active.reduce((sum, item) => sum + Math.max(item.weight, 1), 0);
  if (!active.length || totalWeight <= 0) {
    return null;
  }

  let randomValue = Math.random() * totalWeight;
  for (const item of active) {
    randomValue -= Math.max(item.weight, 1);
    if (randomValue <= 0) {
      return item;
    }
  }

  return active[active.length - 1];
}

app.get("/health", (_, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get("/api/config", (_, res) => {
  res.json({ videos, links, stats, settings });
});

app.get("/api/stats", (_, res) => {
  res.json(stats);
});

app.get("/api/next-link", (_, res) => {
  const link = pickWeightedLink();
  res.json({ link });
});

app.post("/api/videos", (req, res) => {
  const { id, title, url, durationSec } = req.body;
  if (!title || !url) {
    return res.status(400).json({ error: "title and url are required" });
  }

  videos.push({
    id: id || `v-${Date.now()}`,
    title: String(title),
    url: sanitizeUrl(String(url)),
    durationSec: Number(durationSec) || settings.rotateEverySec,
  });

  return res.status(201).json({ ok: true });
});

app.delete("/api/videos/:id", (req, res) => {
  const index = videos.findIndex((video) => video.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "video not found" });
  }

  videos.splice(index, 1);
  return res.json({ ok: true });
});

app.post("/api/links", (req, res) => {
  const { id, name, url, weight, active } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: "name and url are required" });
  }

  links.push({
    id: id || `l-${Date.now()}`,
    name: String(name),
    url: sanitizeUrl(String(url)),
    weight: Number(weight) > 0 ? Number(weight) : 1,
    active: active !== false,
  });

  return res.status(201).json({ ok: true });
});

app.patch("/api/links/:id/toggle", (req, res) => {
  const link = links.find((item) => item.id === req.params.id);
  if (!link) {
    return res.status(404).json({ error: "link not found" });
  }

  link.active = !link.active;
  return res.json({ ok: true, link });
});

app.post("/api/events/view", (req, res) => {
  const { videoId } = req.body;
  if (!videoId) {
    return res.status(400).json({ error: "videoId is required" });
  }

  if (!isLikelyBot(req.headers["user-agent"])) {
    stats.views += 1;
    stats.perVideo[videoId] = (stats.perVideo[videoId] || 0) + 1;
  }

  return res.json({ ok: true });
});

app.post("/api/events/click", (req, res) => {
  const { linkId } = req.body;
  const selected = links.find((item) => item.id === linkId && item.active) || pickWeightedLink();

  if (!selected) {
    return res.status(404).json({ error: "no active link found" });
  }

  if (!isLikelyBot(req.headers["user-agent"])) {
    stats.clicks += 1;
    stats.perLink[selected.id] = (stats.perLink[selected.id] || 0) + 1;
  }

  return res.json({ ok: true, linkId: selected.id, redirectUrl: selected.url });
});

app.get("/r/:id", (req, res) => {
  const link = links.find((item) => item.id === req.params.id && item.active);
  if (!link) {
    return res.status(404).send("Link not found");
  }

  if (!isLikelyBot(req.headers["user-agent"])) {
    stats.clicks += 1;
    stats.perLink[link.id] = (stats.perLink[link.id] || 0) + 1;
  }

  return res.redirect(link.url);
});

app.listen(PORT, () => {
  console.log(`Traffic backend running on http://localhost:${PORT}`);
});