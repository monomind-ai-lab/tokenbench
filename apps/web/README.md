This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Cloudflare Workers preview

The app deploys to Cloudflare Workers through the OpenNext adapter
(`@opennextjs/cloudflare`). Everything is scoped to this package; the
`tokenbench` Pages project is untouched.

```bash
CLOUDFLARE_ACCOUNT_ID=<account> npm run cf:build   # build the worker bundle
CLOUDFLARE_ACCOUNT_ID=<account> npx wrangler dev   # run it locally in workerd
CLOUDFLARE_ACCOUNT_ID=<account> npx wrangler deploy
```

`cf:build` does three things before the adapter runs:

1. `cf:validators` precompiles the accepted UI data contract schemas, because
   workerd forbids the `new Function` call Ajv uses to compile them at runtime.
2. `next build` runs with `TOKENBENCH_CLOUDFLARE_BUILD=1`, which swaps
   `ajv/dist/2020.js` for the precompiled shim in `src/cloudflare/`.
3. `scripts/flatten-standalone.mjs` hoists the standalone output out of
   `apps/web/`, where repository-root file tracing places it, so the adapter can
   find `pages-manifest.json`.

Runtime configuration (`TOKENBENCH_UI_DATA_MODE`, `TOKENBENCH_UI_DATA_BASE_URL`,
and the price-performance pair) lives in `wrangler.jsonc` under `vars`.
