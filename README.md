# Tangerine's LSA/RMA Scheduler

A simple LSA/RMA scheduler that supports scheduling for joint floor appointment times! Designed to solve the issue of joint LSA appointment scheduling being a huge shitshow because people misunderstand the process and mess up lol. 

_1st official installment of my crusade against spreadsheets. _

Developed using Codex! Mostly because I'm not cracked at HTMl/CSS/JS like that lol. and I needed this to be out on a short timeline for actual use, because the goal was to actually use it to plan LSA/RMAs in Sixth during the 2026/27 move in szn. But the specs, scope, and frontend is all designed by me using figma :)

To use, just go to the github pages, which is where the frontend is hosted. All data is stored in my personal Supabase database, no identifying information is collected nor stored. 

_(it lowkey just uses one auth pin for all admins and the rest of it runs on honor systems.)_

what this app does address: 
- preventing people from overlapping times by accidentally overwriting on an excel sheet
- preventing people from misunderstanding and booking multiple times for the same suite
- preventing people from not understanding the timeframe needed for LSA/RMA, as well as policies (like all residents must be present)
- allowing people booking joint LSAs to easily view overlapping times for the associated floors/RAs.
- allowing people booking single-floor LSAs to not have to cross reference with joint LSA bookings, which might be located on a different spot, introducing error.
- allowing people to easily view their booking and change it if needed.
- providing RAs an easy way to edit availability and review which suites have not booked yet. 

what this app does not address:
- preventing people from editing other peoples' bookings (no authentication/account system)
- automatically sending notifications/confirmation emails. (that would require a server and angel does not want to run a server for v1)
- supporting other colleges (keeping it narrowed down to sixth)
- accounting for timezone shifts (son it's only meant to be used for like, 2 weeks)
- supporting massive amounts of activity (yes, the residential community is pretty large, no i do not think every single person will try to be on there at once.)
