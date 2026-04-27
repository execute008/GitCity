/**
 * api/contributions.js — Lambda Function URL handler
 * GET /api/contributions/{username}
 *
 * Fetches ALL years of contribution data for a GitHub user via GraphQL.
 * Reads token from SST-linked secret (Resource.GithubToken.value).
 */

import { Resource } from "sst";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

async function fetchJoinYear(username, token) {
  const query = `query($login: String!) { user(login: $login) { createdAt } }`;
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `bearer ${token}` },
    body: JSON.stringify({ query, variables: { login: username } }),
  });
  const json = await res.json();
  const createdAt = json.data?.user?.createdAt;
  return createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear() - 1;
}

async function fetchYear(username, year, token) {
  const today = new Date();
  const isCurrentYear = year === today.getFullYear();
  const from = `${year}-01-01T00:00:00Z`;
  const to = isCurrentYear
    ? today.toISOString().replace(/\.\d{3}Z$/, "Z")
    : `${year}-12-31T23:59:59Z`;

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? "GET";
  if (method === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };
  if (method !== "GET") return json(405, { error: "Method not allowed" });

  const path = event.rawPath || "";
  const segments = path.split("/").filter(Boolean);
  const username = decodeURIComponent(segments[segments.length - 1] || "").trim();
  if (!username || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(username)) {
    return json(400, { error: "Username required" });
  }

  const token = Resource.GithubToken.value;
  if (!token) return json(500, { error: "GITHUB_TOKEN not configured on server." });

  try {
    const currentYear = new Date().getFullYear();
    const joinYear = await fetchJoinYear(username, token);
    const years = [];
    for (let y = joinYear; y <= currentYear; y++) years.push(y);

    const perYear = await Promise.all(years.map(y => fetchYear(username, y, token)));

    const seen = new Map();
    perYear.flat().forEach(d => {
      if (!seen.has(d.date) || d.count > 0) seen.set(d.date, d.count);
    });

    const contributions = Array.from(seen.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return json(200, { username, years, contributions }, {
      "Cache-Control": process.env.CACHE_CONTROL || "s-maxage=3600, stale-while-revalidate=86400",
    });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    return json(status, { error: err.message });
  }
}
