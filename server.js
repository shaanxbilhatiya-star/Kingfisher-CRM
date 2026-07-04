// Kingfisher (Client) x Ruralift (Brand) — Lead CRM
// Standalone system. Not connected to the loan-facilitation CRM/data.
//
// Flow:
//  - Agent runs disposition on a number -> if "interested", must pick a Package.
//    Lead lands in "My Interested Leads".
//  - Agent can also add an Interested Lead manually (Full Name, Package Type, Mobile No required).
//  - From My Interested Leads: agent can WhatsApp-copy a package message (editable package),
//    set a Followup (must pick a package), or mark Converted.
//  - Converted leads move to "Converted Customers" (no upload/document flow — just a straight move).

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3100;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ─── Persistent Data Location ─────────────────────────────────────────────
// Same convention as the Ruralift loan CRM: keep data outside the project
// folder so re-deploys/re-clones don't wipe it. Override with
// KINGFISHER_DATA_DIR (e.g. a mounted persistent volume on Railway).
let DATA_ROOT = process.env.KINGFISHER_DATA_DIR || path.join(os.homedir(), '.kingfisher-crm');
try {
  ensureDir(DATA_ROOT);
} catch (e) {
  console.error('Could not use external data folder "' + DATA_ROOT + '" (' + e.message + '). Falling back to project folder.');
  DATA_ROOT = __dirname;
}

const looksLikeContainerHost = !!(
  process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_ENVIRONMENT_ID || process.env.RENDER ||
  process.env.DYNO || process.env.FLY_APP_NAME
);
if (looksLikeContainerHost && !process.env.KINGFISHER_DATA_DIR) {
  console.error(
    '\n🚨 DATA LOSS RISK: this looks like a container host (Railway/Render/Heroku/Fly), ' +
    'and KINGFISHER_DATA_DIR is NOT set.\n' +
    '   Data is sitting at "' + DATA_ROOT + '" inside the container filesystem — ' +
    'that is NOT a persistent volume and WILL be wiped on next deploy/restart.\n' +
    '   Set KINGFISHER_DATA_DIR to a mounted persistent volume path (e.g. /data).\n'
  );
}

const STATE_FILE = path.join(DATA_ROOT, 'state.json');

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Package Definitions (single source of truth, server-side) ────────────
const PACKAGES = {
  kitty_party: {
    id: 'kitty_party',
    name: 'Kitty Party Event',
    price: '₹499/- per lady',
    whatsapp: (leadName) =>
`Hi${leadName ? ' ' + leadName : ''}! 🎉

*Kitty Party @ Kingfisher Mandla Resort & Entertainment*
"Celebrate - Laugh - Enjoy - Perfect reason to get together"

💰 Special Price: *₹499/- per lady*

✅ What's included:
• Welcome Drink
• Lunch Buffet
• Reserved Seating Area
• Music System Access
• Tambola Tickets & Material
• Selfie Point / Photo Corner
• Winner Gift by Kingfisher

🍽️ Lunch Menu:
Welcome Drink (Lemon Mint/Jaljeera), Crispy Corn & French Fries (unlimited), Paneer Sabzi, Dal Tadka, Jeera Rice, Naan, Gulab Jamun

Perfect for groups of 8+ ladies. Cushioned seating, DJ music, safe & family-friendly environment.

Reply here to book your slot! 🙌
— Ruralift x Kingfisher`
  },
  family_fun_day: {
    id: 'family_fun_day',
    name: 'Family Fun Day (Water Park + Movie + Food)',
    price: 'From ₹1,499/-',
    whatsapp: (leadName) =>
`Hi${leadName ? ' ' + leadName : ''}! 🎉

*Family Fun Day @ Kingfisher* — Water Park + Movie + Food, all in one!
"Make Every Moment a Family Memory"

👨‍👩‍👧 Package A – Family of 3 (2 Adults + 1 Child): *₹1,499/-* (worth ₹2,450, save ₹951)
Includes: Water Park entry x3, Costume x3, Movie ticket x3, Kids Jumping Section, Welcome Drink x3

👨‍👩‍👧‍👦 Package B – Family of 4 (2 Adults + 2 Children): *₹1,799/-* (worth ₹3,200, save ₹1,401)
Includes: Water Park entry x4, Costume x4, Movie ticket x4, Kids Jumping Section x2, Welcome Drink x4

✨ Add-ons available: Fish Spa ₹99, Bull Ride ₹99, Massage Chair ₹99-129, Photography ₹199

Valid for one day. Reply here to book! 🙌
— Ruralift x Kingfisher`
  },
  dream_wedding: {
    id: 'dream_wedding',
    name: 'Your Dream Wedding Venue',
    price: 'From ₹2,99,000/-',
    whatsapp: (leadName) =>
`Hi${leadName ? ' ' + leadName : ''}! 💍

*Your Dream Wedding @ Kingfisher Mandla Resort & Entertainment*
Mandla Raipur Road, Pondi Maharajpur, Mandla (M.P.) 481665

🏛️ Economy Package
• 1 Day: ₹2,99,000/- — 02 Halls, 500 pax food (veg+non-veg dinner), decoration, DJ & Anchor
• 2 Days: ₹4,51,000/- — 06 Halls (Hall+Lawn), 500 pax food, decoration, DJ & Anchor

✨ Premium Package
• 1 Day: ₹5,51,000/- — 15 Halls (Lawns+Cottages), AC Room & Lawn, 100 pax breakfast+lunch, 500 pax dinner, top-tier decor (Haldi/Mehendi/Sangeet/Stage/Mandap/Gate), DJ & Anchor
• 2 Days: ₹8,51,000/- — 15 Halls+15 Cottages+AC Hall+Lawn, full 2-day catering, top-tier decor across both days, DJ & Anchor

Let's plan your big day! Reply here for a site visit. 🙌
— Ruralift x Kingfisher`
  },
  pool_party: {
    id: 'pool_party',
    name: 'Pool Party Event',
    price: '₹3,000 (10 pax) / ₹4,999 (20+ pax)',
    whatsapp: (leadName) =>
`Hi${leadName ? ' ' + leadName : ''}! 🏊

*Exclusive Pool Party Package @ Kingfisher*
"Celebrate - Enjoy - Make Memories"

💰 Minimum 10 people: *₹3,000/-*
💰 20 or more (10+ price): *₹4,999/-*

✅ Includes:
• 3 Hours Exclusive Pool Access
• Unlimited Tea, Maggie & Crispy Corn
• Music System

✨ Add-ons: DJ ₹2,999, Decoration ₹1,999, Photography ₹1,999, Fog/Smoke Effect ₹1,499, Cake (1kg) ₹799, Cold Drinks on actuals

Perfect for birthdays, get-togethers, kitty parties & small corporate parties. Limited bookings/day — book in advance!

Reply here to book! 🙌
— Ruralift x Kingfisher`
  }
};

function packagesPublicList() {
  return Object.values(PACKAGES).map(p => ({ id: p.id, name: p.name, price: p.price }));
}

// ─── State ──────────────────────────────────────────────────────────────
let state = {
  agents: {},   // agentId -> { id, name, createdAt }
  leads: []     // see lead shape below
};

/* Lead shape:
{
  id, fullName, mobile, packageId,
  disposition: 'interested' | 'followup' | 'not_interested' | 'dead' | 'converted',
  agentId, agentName,
  source: 'disposition' | 'manual',
  createdAt, updatedAt,
  followupAt, followupPackageId, followupNote,
  convertedAt
}
*/

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = Object.assign(state, raw);
    }
  } catch (e) {
    console.error('Failed to load state:', e.message);
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error('Failed to save state:', e.message);
    }
  }, 150);
}

loadState();

function broadcast() {
  io.emit('state-updated');
}

// ─── Agents ─────────────────────────────────────────────────────────────
app.post('/api/agent/register', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  state.agents[id] = { id, name: name.trim(), createdAt: new Date().toISOString() };
  saveState();
  res.json({ agentId: id, name: name.trim() });
});

app.get('/api/agents-list', (req, res) => {
  res.json(Object.values(state.agents));
});

// ─── Packages ───────────────────────────────────────────────────────────
app.get('/api/packages', (req, res) => {
  res.json(packagesPublicList());
});

app.get('/api/packages/:id/whatsapp', (req, res) => {
  const pkg = PACKAGES[req.params.id];
  if (!pkg) return res.status(404).json({ error: 'Unknown package' });
  const leadName = (req.query.name || '').trim();
  res.json({ message: pkg.whatsapp(leadName) });
});

// ─── Disposition (new number worked by an agent) ───────────────────────
// If disposition === 'interested', packageId is required, and a lead is created.
// If disposition === 'followup', packageId is required (per spec: ask to select package while adding in dispo).
const VALID_DISPOSITIONS = ['interested', 'followup', 'not_interested', 'dead'];

app.post('/api/agent/disposition', (req, res) => {
  const { agentId, fullName, mobile, disposition, packageId, followupAt, followupNote } = req.body;
  if (!agentId || !state.agents[agentId]) return res.status(400).json({ error: 'Invalid agentId' });
  if (!mobile || !mobile.trim()) return res.status(400).json({ error: 'Mobile number required' });
  if (!VALID_DISPOSITIONS.includes(disposition)) return res.status(400).json({ error: 'Invalid disposition' });

  if ((disposition === 'interested' || disposition === 'followup') && !PACKAGES[packageId]) {
    return res.status(400).json({ error: 'Package selection required for this disposition' });
  }

  const agent = state.agents[agentId];
  const now = new Date().toISOString();

  const lead = {
    id: uuidv4(),
    fullName: (fullName || '').trim(),
    mobile: mobile.trim(),
    packageId: packageId || null,
    disposition,
    agentId,
    agentName: agent.name,
    source: 'disposition',
    createdAt: now,
    updatedAt: now,
    followupAt: disposition === 'followup' ? (followupAt || null) : null,
    followupPackageId: disposition === 'followup' ? packageId : null,
    followupNote: disposition === 'followup' ? (followupNote || '') : null,
    convertedAt: null
  };

  state.leads.push(lead);
  saveState();
  broadcast();
  res.json({ success: true, lead });
});

// ─── Manual Add: "+ Add Interested Lead Manually" ──────────────────────
// Required fields: Full Name, Package Type, Mobile No
app.post('/api/agent/add-interested-manual', (req, res) => {
  const { agentId, fullName, mobile, packageId } = req.body;
  if (!agentId || !state.agents[agentId]) return res.status(400).json({ error: 'Invalid agentId' });
  if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'Full Name required' });
  if (!mobile || !mobile.trim()) return res.status(400).json({ error: 'Mobile No required' });
  if (!PACKAGES[packageId]) return res.status(400).json({ error: 'Package Type required' });

  const agent = state.agents[agentId];
  const now = new Date().toISOString();

  const lead = {
    id: uuidv4(),
    fullName: fullName.trim(),
    mobile: mobile.trim(),
    packageId,
    disposition: 'interested',
    agentId,
    agentName: agent.name,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    followupAt: null,
    followupPackageId: null,
    followupNote: null,
    convertedAt: null
  };

  state.leads.push(lead);
  saveState();
  broadcast();
  res.json({ success: true, lead });
});

// ─── Remove an interested/followup lead (agent's own) ──────────────────
app.post('/api/agent/remove-lead', (req, res) => {
  const { agentId, leadId } = req.body;
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.agentId !== agentId) return res.status(403).json({ error: 'Not your lead' });
  state.leads = state.leads.filter(l => l.id !== leadId);
  saveState();
  broadcast();
  res.json({ success: true });
});

// ─── Update package on an existing interested lead (agent can change it) ─
app.post('/api/agent/update-lead-package', (req, res) => {
  const { agentId, leadId, packageId } = req.body;
  if (!PACKAGES[packageId]) return res.status(400).json({ error: 'Invalid package' });
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.agentId !== agentId) return res.status(403).json({ error: 'Not your lead' });
  lead.packageId = packageId;
  lead.updatedAt = new Date().toISOString();
  saveState();
  broadcast();
  res.json({ success: true, lead });
});

// ─── Set / update a Followup on a lead (package selection required) ────
app.post('/api/agent/set-followup', (req, res) => {
  const { agentId, leadId, followupAt, packageId, followupNote } = req.body;
  if (!PACKAGES[packageId]) return res.status(400).json({ error: 'Package selection required' });
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.agentId !== agentId) return res.status(403).json({ error: 'Not your lead' });

  lead.disposition = 'followup';
  lead.followupAt = followupAt || null;
  lead.followupPackageId = packageId;
  lead.followupNote = followupNote || '';
  lead.packageId = packageId;
  lead.updatedAt = new Date().toISOString();
  saveState();
  broadcast();
  res.json({ success: true, lead });
});

// ─── Convert a lead -> Converted Customers ──────────────────────────────
app.post('/api/agent/convert-lead', (req, res) => {
  const { agentId, leadId } = req.body;
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.agentId !== agentId) return res.status(403).json({ error: 'Not your lead' });

  lead.disposition = 'converted';
  lead.convertedAt = new Date().toISOString();
  lead.updatedAt = lead.convertedAt;
  saveState();
  broadcast();
  res.json({ success: true, lead });
});

// ─── Agent Views ─────────────────────────────────────────────────────────
app.get('/api/agent/interested/:agentId', (req, res) => {
  const leads = state.leads
    .filter(l => l.agentId === req.params.agentId && l.disposition === 'interested')
    .map(withPackageInfo)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(leads);
});

app.get('/api/agent/followups/:agentId', (req, res) => {
  const leads = state.leads
    .filter(l => l.agentId === req.params.agentId && l.disposition === 'followup')
    .map(withPackageInfo)
    .sort((a, b) => new Date(a.followupAt || 0) - new Date(b.followupAt || 0));
  res.json(leads);
});

app.get('/api/agent/converted/:agentId', (req, res) => {
  const leads = state.leads
    .filter(l => l.agentId === req.params.agentId && l.disposition === 'converted')
    .map(withPackageInfo)
    .sort((a, b) => new Date(b.convertedAt) - new Date(a.convertedAt));
  res.json(leads);
});

function withPackageInfo(lead) {
  const pkg = PACKAGES[lead.packageId];
  return Object.assign({}, lead, {
    packageName: pkg ? pkg.name : null,
    packagePrice: pkg ? pkg.price : null
  });
}

// ─── TL / Admin Views (all leads across agents) ─────────────────────────
app.get('/api/tl/interested', (req, res) => {
  res.json(state.leads.filter(l => l.disposition === 'interested').map(withPackageInfo)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
});
app.get('/api/tl/followups', (req, res) => {
  res.json(state.leads.filter(l => l.disposition === 'followup').map(withPackageInfo)
    .sort((a, b) => new Date(a.followupAt || 0) - new Date(b.followupAt || 0)));
});
app.get('/api/tl/converted', (req, res) => {
  res.json(state.leads.filter(l => l.disposition === 'converted').map(withPackageInfo)
    .sort((a, b) => new Date(b.convertedAt) - new Date(a.convertedAt)));
});
app.get('/api/tl/stats', (req, res) => {
  res.json({
    totalLeads: state.leads.length,
    interested: state.leads.filter(l => l.disposition === 'interested').length,
    followup: state.leads.filter(l => l.disposition === 'followup').length,
    converted: state.leads.filter(l => l.disposition === 'converted').length,
    notInterested: state.leads.filter(l => l.disposition === 'not_interested').length,
    dead: state.leads.filter(l => l.disposition === 'dead').length,
    byPackage: packagesPublicList().map(p => ({
      packageId: p.id,
      packageName: p.name,
      interested: state.leads.filter(l => l.packageId === p.id && l.disposition === 'interested').length,
      converted: state.leads.filter(l => l.packageId === p.id && l.disposition === 'converted').length
    }))
  });
});

// Admin: reassign / remove any lead
app.post('/api/admin/remove-lead', (req, res) => {
  const { leadId } = req.body;
  state.leads = state.leads.filter(l => l.id !== leadId);
  saveState();
  broadcast();
  res.json({ success: true });
});

app.post('/api/admin/reassign-lead', (req, res) => {
  const { leadId, newAgentId } = req.body;
  const lead = state.leads.find(l => l.id === leadId);
  const agent = state.agents[newAgentId];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  lead.agentId = newAgentId;
  lead.agentName = agent.name;
  lead.updatedAt = new Date().toISOString();
  saveState();
  broadcast();
  res.json({ success: true, lead });
});

app.post('/api/admin/hard-reset', (req, res) => {
  state.leads = [];
  saveState();
  broadcast();
  res.json({ success: true });
});

// ─── Page routes ─────────────────────────────────────────────────────────
app.get('/agent', (req, res) => res.sendFile(path.join(__dirname, 'public/agent/index.html')));
app.get('/tl', (req, res) => res.sendFile(path.join(__dirname, 'public/tl/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

server.listen(PORT, () => {
  console.log(`Kingfisher x Ruralift CRM running on port ${PORT}`);
  console.log(`Data dir: ${DATA_ROOT}`);
});
