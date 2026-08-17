# Contributing

Use Node.js 22 and install dependencies with `npm install`. Before opening a pull request, run:

```bash
npm run type-check
npm run lint
npx prettier . --check
npm run test
npm run build
```

Schema, Storage policy, and Edge Function changes must include their matching Supabase migration/source updates and a short verification note. Never commit production credentials, real participant data, personal photographs, or build artifacts.
