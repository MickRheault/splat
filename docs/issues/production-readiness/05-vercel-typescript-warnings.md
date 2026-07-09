# Issue: Silence Vercel Serverless TS Compilation Warnings

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Address TypeScript errors printed during serverless compilation on Vercel:
- Vercel's independent builder complains about missing declarations for the Node `process` object inside `/api/*.ts` serverless endpoints.
- Add `declare const process: any;` (or appropriate global scope definitions) at the top of the serverless API files to completely satisfy the typescript checker without affecting other frontend module configurations.

## Acceptance criteria

- [ ] Vercel build compilation reports 0 typescript errors/warnings for `/api` scripts.
- [ ] Endpoint runtime behaviour remains unchanged.
