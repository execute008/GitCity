/**
 * api/svg.js — Lambda Function URL handler
 * GET /api/svg?u=USERNAME&theme=matrix
 *
 * Isometric 3D skyline SVG for README embeds.
 */

import { Resource } from "sst";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

const THEMES = {
    matrix: { bg: "#060d06", ground: "#0a140a", accent: "#00ff41", muted: "#2d5a2d", text: "#b0ffb0", border: "#0e2a0e", levels: ["#0a1a0a", "#0e4020", "#1a7535", "#27ae60", "#00ff41"] },
    noir: { bg: "#04080f", ground: "#080f1a", accent: "#00d4ff", muted: "#1a3a50", text: "#e0f4ff", border: "#0a1e30", levels: ["#0c1525", "#0d2d4e", "#0e5080", "#1a8fc1", "#00d4ff"] },
    aurora: { bg: "#030710", ground: "#080d1e", accent: "#a855f7", muted: "#2a1a50", text: "#d0e8ff", border: "#120a2e", levels: ["#0a1428", "#2d1060", "#5b20a0", "#8b35d0", "#a855f7"] },
    ocean: { bg: "#020c14", ground: "#05111e", accent: "#00b4d8", muted: "#0a2a3a", text: "#cceeff", border: "#061828", levels: ["#061828", "#0a3060", "#0a6090", "#0090c0", "#00b4d8"] },
    gold: { bg: "#0c0900", ground: "#150e00", accent: "#ffd700", muted: "#4a3800", text: "#fff3cc", border: "#1a1200", levels: ["#1a1200", "#4a3000", "#806000", "#c09000", "#ffd700"] },
    ice: { bg: "#060810", ground: "#0a0d1a", accent: "#a8c8ff", muted: "#1a2240", text: "#e8f0ff", border: "#0d1220", levels: ["#0d1220", "#1a2a50", "#2a4a90", "#4a70d0", "#a8c8ff"] },
};

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function adjustBrightness(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function fetchContributions(username, token) {
    const now = new Date();
    const fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const from = fromDate.toISOString().replace(/\.\d{3}Z$/, "Z");
    const to = now.toISOString().replace(/\.\d{3}Z$/, "Z");

    const query = `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }
    `;
    const res = await fetch(GITHUB_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `bearer ${token}` },
        body: JSON.stringify({ query, variables: { login: username, from, to } }),
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message ?? "GraphQL error");

    const weeks = json.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
    if (!weeks) throw new Error(`User "${username}" not found.`);

    return weeks
        .flatMap(w => w.contributionDays)
        .map(d => ({ date: d.date, count: d.contributionCount }));
}

function buildIsometricSVG(username, days, themeName) {
    const t = THEMES[themeName] || THEMES.matrix;
    const total = days.reduce((s, d) => s + d.count, 0);
    const maxC = Math.max(...days.map(d => d.count), 1);

    // Absolute-scale: 1 commit ≈ 6 sqrt-units. Uncapped — a 400-commit day
    // really is 2× the height of a 100-commit day. Colours still bucket
    // against maxC so the legend stays meaningful per user.
    const BUILD_UNIT = 6;
    const heightFor = c => c === 0 ? 1 : Math.max(2, Math.sqrt(c) * BUILD_UNIT);
    const actualMaxH = Math.max(...days.map(d => heightFor(d.count)), 60);

    const TW = 12, TH = 6, WEEKS = 53, DAYS = 7;

    const dayList = [...days].sort((a, b) => a.date.localeCompare(b.date));

    const weeks = [];
    let week = new Array(7).fill(0);
    dayList.forEach(d => {
        const dow = new Date(d.date + "T12:00:00Z").getUTCDay();
        week[dow] = d.count;
        if (dow === 6) { weeks.push([...week]); week = new Array(7).fill(0); }
    });
    if (week.some(v => v > 0)) weeks.push(week);

    const numWeeks = Math.min(weeks.length, 53);

    function iso(col, row) {
        return { x: (col - row) * (TW / 2), y: (col + row) * (TH / 2) };
    }

    const corners = [
        iso(0, 0), iso(numWeeks - 1, 0),
        iso(0, DAYS - 1), iso(numWeeks - 1, DAYS - 1),
    ];
    const minX = Math.min(...corners.map(c => c.x));
    const maxX = Math.max(...corners.map(c => c.x)) + TW;
    const maxY = Math.max(...corners.map(c => c.y)) + TH;

    const PAD_X = 20;
    const PAD_TOP = actualMaxH + 28;
    const PAD_BOT = 28;

    const SVG_W = (maxX - minX) + PAD_X * 2;
    const SVG_H = PAD_TOP + maxY + PAD_BOT;
    const OX = PAD_X - minX;
    const OY = PAD_TOP;

    function level(count) {
        if (!count) return 0;
        const r = count / maxC;
        return r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4;
    }

    const buildings = [];
    for (let wi = 0; wi < numWeeks; wi++) {
        for (let day = 0; day < DAYS; day++) {
            const count = weeks[wi][day];
            const lv = level(count);
            const base = t.levels[lv];
            const bH = heightFor(count);
            buildings.push({ wi, day, count, lv, base, bH });
        }
    }
    buildings.sort((a, b) => (a.wi + a.day) - (b.wi + b.day) || (a.day - b.day));

    let shapes = "";

    for (let wi = 0; wi <= numWeeks; wi += 4) {
        const p0 = iso(wi, 0), p1 = iso(wi, DAYS - 1);
        shapes += `<line x1="${OX + p0.x + TW / 2}" y1="${OY + p0.y + TH / 2}" x2="${OX + p1.x + TW / 2}" y2="${OY + p1.y + TH / 2}" stroke="${t.border}" stroke-width="0.5" opacity="0.6"/>`;
    }
    for (let day = 0; day < DAYS; day++) {
        const p0 = iso(0, day), p1 = iso(numWeeks - 1, day);
        shapes += `<line x1="${OX + p0.x + TW / 2}" y1="${OY + p0.y + TH / 2}" x2="${OX + p1.x + TW / 2}" y2="${OY + p1.y + TH / 2}" stroke="${t.border}" stroke-width="0.5" opacity="0.6"/>`;
    }

    for (const { wi, day, count, base, bH } of buildings) {
        const { x, y } = iso(wi, day);
        const cx = OX + x + TW / 2;
        const cy = OY + y + TH / 2;

        const Tx = cx, Ty = cy - bH;
        const Rx = cx + TW / 2, Ry = cy - bH + TH / 2;
        const Bx = cx, By = cy - bH + TH;
        const Lx = cx - TW / 2, Ly = cy - bH + TH / 2;

        const LBy = Ly + bH, BBy = By + bH, RBy = Ry + bH;

        if (count === 0) {
            const colFlat = t.levels[0];
            shapes += `<polygon points="${Tx},${Ty} ${Rx},${Ry} ${Bx},${By} ${Lx},${Ly}" fill="${colFlat}" stroke="${t.border}" stroke-width="0.3"/>`;
        } else {
            const colTop = adjustBrightness(base, +45);
            const colLeft = adjustBrightness(base, +5);
            const colRight = adjustBrightness(base, -25);
            const colEdge = adjustBrightness(base, -45);

            shapes += `<polygon points="${Rx},${Ry} ${Bx},${By} ${Bx},${BBy} ${Rx},${RBy}" fill="${colRight}" stroke="${colEdge}" stroke-width="0.3"/>`;
            shapes += `<polygon points="${Lx},${Ly} ${Bx},${By} ${Bx},${BBy} ${Lx},${LBy}" fill="${colLeft}" stroke="${colEdge}" stroke-width="0.3"/>`;
            shapes += `<polygon points="${Tx},${Ty} ${Rx},${Ry} ${Bx},${By} ${Lx},${Ly}" fill="${colTop}" stroke="${colEdge}" stroke-width="0.3"/>`;
            shapes += `<polyline points="${Lx},${Ly} ${Tx},${Ty} ${Rx},${Ry}" fill="none" stroke="${adjustBrightness(base, 80)}" stroke-width="0.5" opacity="0.6"/>`;

            if (bH > 12) {
                const floors = Math.max(1, Math.floor(bH / 6));
                const wW = TW * 0.12, wH = TH * 0.55;
                for (let f = 0; f < floors; f++) {
                    const fy = By + bH - (f + 1) * (bH / floors) + bH / floors * 0.2;
                    const wx0 = Lx + (TW / 2) * 0.25 - (wW / 2);
                    shapes += `<rect x="${wx0}" y="${fy}" width="${wW}" height="${wH}" rx="0.3" fill="${t.accent}" opacity="0.35"/>`;
                    const wx1 = Lx + (TW / 2) * 0.7 - (wW / 2);
                    shapes += `<rect x="${wx1}" y="${fy}" width="${wW}" height="${wH}" rx="0.3" fill="${t.accent}" opacity="0.25"/>`;
                }
            }
        }
    }

    let monthLabels = ""; let lastM = -1;
    weeks.forEach((w, wi) => {
        const idx = dayList.slice(wi * 7, (wi + 1) * 7).find(d => d);
        if (!idx) return;
        const dt = new Date(idx.date + "T12:00:00Z");
        const m = dt.getUTCMonth();
        if (m !== lastM) {
            lastM = m;
            const p = iso(wi, 0);
            const lx = OX + p.x + TW / 2;
            const ly = OY + p.y - 4;
            monthLabels += `<text x="${lx}" y="${ly}" font-family="monospace" font-size="7" fill="${t.muted}" text-anchor="middle">${dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`;
        }
    });

    const lx = PAD_X, ly = SVG_H - 16;
    const legend = `
  <text x="${lx}" y="${ly + 5}" font-family="monospace" font-size="7" fill="${t.muted}">Less</text>
  ${[0, 1, 2, 3, 4].map((l, i) => {
        const base = t.levels[l];
        const px = lx + 26 + i * 10, py = ly - 3;
        const ct = adjustBrightness(base, 30), cl = base, cr = adjustBrightness(base, -20);
        const h = 5;
        return `<polygon points="${px},${py - h} ${px + TW / 2},${py - h + TH / 2} ${px},${py - h + TH} ${px - TW / 2},${py - h + TH / 2}" fill="${ct}"/>
    <polygon points="${px + TW / 2},${py - h + TH / 2} ${px},${py - h + TH} ${px},${py - h + TH + h} ${px + TW / 2},${py - h + TH / 2 + h}" fill="${cr}"/>
    <polygon points="${px - TW / 2},${py - h + TH / 2} ${px},${py - h + TH} ${px},${py - h + TH + h} ${px - TW / 2},${py - h + TH / 2 + h}" fill="${cl}"/>`;
    }).join("")}
  <text x="${lx + 80}" y="${ly + 5}" font-family="monospace" font-size="7" fill="${t.muted}">More</text>
  <text x="${SVG_W - PAD_X}" y="${ly + 5}" text-anchor="end" font-family="monospace" font-size="7" fill="${t.muted}">gitcity.draht.dev</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
  <rect width="${SVG_W}" height="${SVG_H}" rx="12" fill="${t.bg}"/>
  <text x="${PAD_X}" y="18" font-family="monospace" font-size="11" font-weight="bold" fill="${t.accent}">${esc(username)}</text>
  <text x="${PAD_X + username.length * 7}" y="18" font-family="monospace" font-size="10" fill="${t.muted}">'s GitCity Skyline</text>
  <text x="${PAD_X}" y="30" font-family="monospace" font-size="8" fill="${t.muted}">${total.toLocaleString()} contributions in the last year</text>
  ${monthLabels}
  ${shapes}
  ${legend}
</svg>`;
}

function errorSVG(msg) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="80" viewBox="0 0 480 80">
  <rect width="480" height="80" rx="8" fill="#0c0c14"/>
  <text x="16" y="32" font-family="monospace" font-size="12" fill="#ff6b6b">GitCity — could not load skyline</text>
  <text x="16" y="54" font-family="monospace" font-size="10" fill="#555">${esc(msg)}</text>
</svg>`;
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function svgResponse(statusCode, body, cache = true) {
    return {
        statusCode,
        headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": cache
                ? (process.env.CACHE_CONTROL || "s-maxage=3600, stale-while-revalidate=86400")
                : "no-store",
            ...corsHeaders,
        },
        body,
    };
}

export async function handler(event) {
    const method = event.requestContext?.http?.method ?? "GET";
    if (method === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

    const qs = event.queryStringParameters || {};
    let username = (qs.u || qs.username || "").trim().replace(/\.svg$/i, "");
    const theme = (qs.theme || "matrix").toLowerCase();

    if (!username || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(username)) {
        return svgResponse(400, errorSVG("Use ?u=YOUR_GITHUB_USERNAME"), false);
    }

    const token = Resource.GithubToken.value;
    if (!token) return svgResponse(200, errorSVG("GitHub token not configured"), false);

    try {
        const days = await fetchContributions(username, token);
        return svgResponse(200, buildIsometricSVG(username, days, theme));
    } catch (err) {
        return svgResponse(200, errorSVG(err.message), false);
    }
}
