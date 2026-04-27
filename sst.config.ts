/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "gitcity",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: { profile: "axiis", region: "us-east-1" },
      },
    };
  },
  async run() {
    const githubToken = new sst.Secret("GithubToken");

    const cacheControl = "public,max-age=300,s-maxage=3600,stale-while-revalidate=86400";

    const contributions = new sst.aws.Function("Contributions", {
      handler: "api/contributions.handler",
      url: true,
      link: [githubToken],
      environment: { CACHE_CONTROL: cacheControl },
    });

    const og = new sst.aws.Function("Og", {
      handler: "api/og.handler",
      url: true,
      link: [githubToken],
      environment: { CACHE_CONTROL: cacheControl },
    });

    const svg = new sst.aws.Function("Svg", {
      handler: "api/svg.handler",
      url: true,
      environment: { CACHE_CONTROL: cacheControl },
    });

    const isProd = $app.stage === "production";
    const domain = isProd
      ? { name: "gitcity.draht.dev" }
      : undefined;

    const router = new sst.aws.Router("Router", {
      domain,
      routes: {
        "/api/contributions/*": contributions.url,
        "/api/og/*": og.url,
        "/api/svg": svg.url,
      },
    });

    new sst.aws.StaticSite("Web", {
      build: {
        command: "npm run build",
        output: "dist",
      },
      router: { instance: router },
      errorPage: "/index.html",
    });

    return {
      url: router.url,
    };
  },
});
