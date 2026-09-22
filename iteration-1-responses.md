1. Are appointments always exactly two hours, or should residents ever select longer blocks? The notes say “2+ hours,” but the interaction currently selects exactly two consecutive one-hour cells.

The notes say 2+ hours because it depends on suite size and process. large connecting suites (20+ people) can take up to 3 hours for the entire block to complete the LSA/RMA, but a particularly harmonious small single-floor suite (4-6 people) can take less than 2 hours. It is variable, but generally the guidance from past RAs indicate 2 hours plus a little is roughly how long it takes. Not sure if we should enforce different time lengths, or just include it as a warning. My goal is to keep v1 relatively simple, just minimally functional.

2. Does a booking consume the entire time slot for that floor’s RA? I’m assuming yes—another suite on the same floor cannot book the same time. Connected-suite bookings would atomically reserve both floors.

Yes. that is the main problem i am trying to solve with this webapp. previous systems included the chance of confusion, overwriting, double-booking, and a host of other problems. a booking consumes that time slot, and would also affect what a connecting suite with the same RA/floor could then book as well.

3. If an admin changes availability that conflicts with an existing booking, should the change be rejected, or should the booking remain despite becoming unavailable? I recommend rejecting it with an explanation.

Reject it with an explanation. Keep it deliberately simple, low chance of fuck-ups.

4. Should deleting a floor or suite be blocked whenever it has a booking? I recommend blocking deletion rather than cascading and silently deleting bookings.

For a floor deletion, can put a secondary confirmation with a strong warning (mostly because if i want to cleanup from my testing i want it to be easier for me). other edits should be blocked though.

5. For split labels such as 04-A and 04-B, may I treat the display label separately from the suite-number prefix? For example, both could validate suites beginning with 04, while remaining distinct floors in the interface.

Yes, the thing is in real life those floors are both one floor, but it's to help users with different RAs have a more clear view and not force RAs who do not have joint LSAs to share a floor group. in real life people know them by the same FFSS numbering system, so when an RA enters a suite into the "04-A" group, it's not "04-A-11", it's just "0411", but we still need to check that they didn't enter "0511", if that makes sense.

6. For the shared admin PIN, is it acceptable to verify it securely through Supabase and remember admin status only for the current browser session? The PIN itself should not be shipped in the GitHub Pages frontend.

Not sure, because right now as i have it admin and user have completely different abilities/views which means if a person is stuck in admin mode they might be confused why they cannot see bookings and unbooked suites. alternatively, i might be open to also including the standard all bookings calendar view (with the colored blocks and list of not yet booked suites) and have the add/edit booking button on that view (from the user view) be instead leading to modifying availability, if that makes sense?

7. Should the interface be fully usable on phones, or is desktop/tablet the primary target? The mockups are desktop-oriented, but residents will likely open this from mobile.

Yes, one of the key things is that this must support mobile use. I was thinking for the mobile use to stack things vertically and instead of displaying the whole week, display like 3-day chunks with arrows at the bottom. But i am very flexible on that as I am not as good at designing for mobile lol.

## Agreed v1 decisions

- Standard suite appointments reserve a two-hour block.
- Connected-suite appointments reserve a three-hour block to account for the larger group and prevent an effective overlap with a later booking.
- A booking exclusively reserves its floor/RA for the full appointment. A connected-suite booking atomically reserves both associated floors.
- Availability changes that conflict with an existing booking are rejected with an explanation.
- Suite edits and deletions are blocked when an existing booking depends on that suite.
- Floor deletion remains available for testing and cleanup, but requires a strong secondary confirmation warning that associated bookings will also be deleted.
- A floor's display label and suite-number validation prefix are separate values. For example, `04-A` and `04-B` are distinct scheduling groups, but both validate suite numbers against the `04` prefix (such as `0411`).
- Admin verification will happen through Supabase rather than exposing the shared PIN in the frontend. Admin status will be remembered for the current browser session.
- Admin mode will be visually explicit, with an admin-mode banner and an option to exit admin mode.
- The admin calendar will retain the standard bookings and unbooked-suites overview. Its primary calendar action will edit availability instead of creating or editing a resident booking.
- Mobile use is a core requirement. Calendar content will stack vertically and show three-day chunks with navigation controls on smaller screens.
