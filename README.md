# Tangerine's LSA/RMA Scheduler

A simple LSA/RMA scheduler that supports scheduling for joint floor appointment times! Designed to solve the issue of joint LSA appointment scheduling being a huge shitshow because people misunderstand the process and mess up lol. 

_1st official installment of my crusade against spreadsheets._

Developed using Codex! Mostly because I'm not cracked at HTMl/CSS/JS like that lol. and I needed this to be out on a short timeline for actual use, because the goal was to actually use it to plan LSA/RMAs in Sixth during the 2026/27 move in szn. But the specs, scope, and frontend is all designed by me using figma :)

The live app is hosted on Cloudflare Workers at [lsa-rma-scheduler.19tangerines.workers.dev](https://lsa-rma-scheduler.19tangerines.workers.dev). Scheduling data is stored in Supabase; no resident names, email addresses, or other identifying information are collected.

_(it lowkey just uses one auth pin for all admins and the rest of it runs on honor systems.)_

what this app does address: 
- preventing people from overlapping times by accidentally overwriting on an excel sheet
- preventing people from misunderstanding and booking multiple times for the same suite
- preventing people from not understanding the timeframe needed for LSA/RMA, as well as policies (like all residents must be present)
- allowing people booking joint LSAs to easily view overlapping times for the associated floors/RAs.
- allowing people booking single-floor LSAs to not have to cross reference with joint LSA bookings, which might be located on a different spot, introducing error.
- allowing people to easily view their booking and change it if needed.
- providing RAs an easy way to edit availability and review which suites have not booked yet. 
- giving each floor or floor pair a shareable link that opens its calendar directly.
- showing the assigned RA name for each floor when one has been configured.

what this app does not address:
- preventing people from editing other peoples' bookings (no authentication/account system)
- automatically sending notifications/confirmation emails.
- supporting other colleges (keeping it narrowed down to sixth)
- accounting for timezone shifts (son it's only meant to be used for like, 2 weeks)
- supporting massive amounts of activity (yes, the residential community is pretty large, no i do not think every single person will try to be on there at once.)

## Local development

1. Install Node.js 22.13 or newer and run `npm install`.
2. Copy `.env.example` to `.env.local` and supply the server-only Supabase credentials and generated admin secrets.
3. Run `npm run dev`.

Useful commands:

- `npm test` builds the production bundle and runs the regression tests.
- `npm run lint` checks the source with ESLint.
- `npm run admin:hash-pin -- 1234` generates an admin PIN hash.
- `npm run admin:session-secret` generates a session-signing secret.
- `npm run deploy` builds and deploys the Cloudflare Worker using `.env.local` as its secret source.

Database schema changes live in `supabase/migrations`. Never commit `.env.local` or any Supabase secret key.
