# Kingfisher x Ruralift — Lead CRM

Standalone CRM for Kingfisher (client) leads, run under the Ruralift brand.
Completely separate codebase and data from the Ruralift loan-facilitation CRM.

## Run locally
```
npm install
node server.js
```
Default port: 3100 (override with `PORT` env var).

Views:
- `/agent` — agent login + disposition + My Interested Leads + My Followups + Converted Customers
- `/tl` — all-agent read view + stats
- `/admin` — same as TL + reassign lead to another agent, remove lead, hard reset

## Data persistence
Data is stored outside the project folder by default (`~/.kingfisher-crm/state.json`)
so redeploys don't wipe it. On Railway/Render/etc, set:
```
KINGFISHER_DATA_DIR=/data
```
pointed at a mounted persistent volume — same pattern as the loan CRM's `AUTOLEAD_DATA_DIR`.

## Flow
1. Agent runs a disposition on a number (Interested / Followup / Not Interested / Dead).
   - Interested and Followup both require a **Package Type** selection.
2. Interested leads land in **⭐ My Interested Leads**. Agent can:
   - Copy a ready-made WhatsApp message for the selected package (editable — agent can change package first)
   - Change the package
   - Set a Followup (package selection required again — Followup Action always asks for it)
   - Mark **Converted** — moves the lead straight to Converted Customers (no doc upload step, no separate form)
   - Remove the lead
3. Agent can also **➕ Add Interested Lead Manually** — requires Full Name, Package Type, Mobile No.
4. **✅ Converted Customers** replaces the old "Documentation Completed" step — there is no upload flow here, just a straight move once the agent hits Converted.

## Packages (hardcoded server-side, single source of truth in `server.js`)
1. Kitty Party Event — ₹499/lady
2. Family Fun Day (Water Park + Movie + Food) — ₹1,499 / ₹1,799
3. Your Dream Wedding Venue — ₹2,99,000 upward
4. Pool Party Event — ₹3,000 / ₹4,999

Each has an auto-generated WhatsApp message template (`PACKAGES[id].whatsapp(leadName)` in `server.js`).
Edit the text there directly if you want to tweak wording — no DB migration needed since packages aren't stored in the data file, just referenced by id.

## Deploying (same pattern as loan CRM)
Push to a new GitHub repo, deploy to Railway, attach a persistent volume, set `KINGFISHER_DATA_DIR=/data`.
