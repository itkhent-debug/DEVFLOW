// ================================================
//   DEPLOYIFY — server.js
//   Express backend with GitHub OAuth + Live Logs
//   Database: MongoDB Atlas (Mongoose)
// ================================================

require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn('Could not set custom DNS servers:', e);
}
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MONGODB CONNECTION =====
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in .env file');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ===== CONFIG =====
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'deployify-secret-key-change-in-prod';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ===== MIDDLEWARE =====
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ===== DATABASE SCHEMAS & MODELS =====
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  login: { type: String, required: true },
  name: String,
  avatar: String,
  token: String,
  email: String
});
const User = mongoose.model('User', UserSchema);

const ProjectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  repo: { type: String, required: true },
  branch: { type: String, default: 'main' },
  framework: { type: String, default: 'Static HTML' },
  userId: { type: String, required: true },
  status: { type: String, default: 'queued' },
  url: String,
  deployments: [String],
  createdAt: { type: Date, default: Date.now },
  lastDeployId: String
});
const Project = mongoose.model('Project', ProjectSchema);

const DeploymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  projectId: { type: String, required: true },
  status: { type: String, default: 'queued' },
  logs: [{
    time: { type: Date, default: Date.now },
    message: String,
    type: { type: String, default: 'info' }
  }],
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
  duration: Number,
  commit: { type: String, default: 'HEAD' },
  commitMsg: String,
  branch: String,
  url: String
});
const Deployment = mongoose.model('Deployment', DeploymentSchema);

// In-memory collection only for ephemeral SSE active client responses
const db = {
  sseClients: {}, // { deployId: [res, res, ...] }
};

// ===== HELPERS =====
async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await User.findOne({ id: req.session.userId });
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

async function pushLog(deployId, message, type = 'info') {
  const log = { time: new Date().toISOString(), message, type };
  try {
    await Deployment.updateOne({ id: deployId }, { $push: { logs: log } });
  } catch (err) {
    console.error('Failed to append log to DB:', err);
  }

  // Push to all SSE clients watching this deploy
  const clients = db.sseClients[deployId] || [];
  const data = JSON.stringify({ log });
  clients.forEach(client => {
    try { client.write(`data: ${data}\n\n`); } catch (e) {}
  });
}

async function finishDeployment(deployId, success = true) {
  try {
    const deployment = await Deployment.findOne({ id: deployId });
    if (!deployment) return;

    const finishedAt = new Date().toISOString();
    const duration = Math.floor((Date.now() - new Date(deployment.startedAt).getTime()) / 1000);
    const status = success ? 'ready' : 'error';

    // Update project status
    let url = null;
    const project = await Project.findOne({ id: deployment.projectId });
    if (project) {
      if (success) {
        url = `http://localhost:${PORT}/sites/${deployId}/index.html`;
      }
      await Project.updateOne(
        { id: deployment.projectId },
        { 
          status,
          lastDeployId: deployId,
          ...(success ? { url } : {})
        }
      );
    }

    await Deployment.updateOne(
      { id: deployId },
      { 
        status, 
        finishedAt, 
        duration,
        ...(success ? { url } : {})
      }
    );

    // Notify SSE clients
    const clients = db.sseClients[deployId] || [];
    const data = JSON.stringify({ status, url, duration });
    clients.forEach(client => {
      try { client.write(`data: ${data}\n\n`); client.end(); } catch (e) {}
    });
    delete db.sseClients[deployId];
  } catch (err) {
    console.error('Failed to finish deployment in DB:', err);
  }
}

// ===== SIMULATE DEPLOYMENT =====
async function simulateDeploy(deployId, repoName, branch, framework) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    await Deployment.updateOne({ id: deployId }, { status: 'building' });
    const deploy = await Deployment.findOne({ id: deployId });
    const commitHash = (deploy && deploy.commit) ? deploy.commit : 'HEAD';

    await pushLog(deployId, `Cloning repository: ${repoName}`, 'info');
    await sleep(600);
    await pushLog(deployId, `Branch: ${branch}`, 'info');
    await sleep(300);
    await pushLog(deployId, `Commit: ${commitHash}`, 'info');
    await sleep(400);

    await pushLog(deployId, '─────────────────────────────────', 'divider');
    await pushLog(deployId, 'Detecting framework...', 'info');
    await sleep(700);
    await pushLog(deployId, `✓ Detected: ${framework || 'Static HTML'}`, 'success');

    await pushLog(deployId, '─────────────────────────────────', 'divider');
    await pushLog(deployId, 'Installing dependencies...', 'info');
    await sleep(500);
    await pushLog(deployId, 'npm install --production', 'cmd');
    await sleep(1200);
    await pushLog(deployId, '✓ Dependencies installed (83 packages)', 'success');

    await pushLog(deployId, '─────────────────────────────────', 'divider');
    await pushLog(deployId, 'Running build...', 'info');
    await sleep(400);

    if (framework && framework.toLowerCase().includes('next')) {
      await pushLog(deployId, 'next build', 'cmd');
      await sleep(800);
      await pushLog(deployId, '  ▲ Next.js 14.0.0', 'log');
      await sleep(400);
      await pushLog(deployId, '  Creating an optimized production build...', 'log');
      await sleep(900);
      await pushLog(deployId, '  ✓ Compiled successfully', 'success');
      await sleep(500);
      await pushLog(deployId, '  Route (app)   Size   First Load JS', 'log');
      await pushLog(deployId, '  ○ /            142 B      79.2 kB', 'log');
    } else {
      await pushLog(deployId, 'No build command — serving static files', 'log');
    }

    await sleep(600);
    await pushLog(deployId, '✓ Build complete', 'success');

    await pushLog(deployId, '─────────────────────────────────', 'divider');
    await pushLog(deployId, 'Uploading to Edge Network...', 'info');
    await sleep(400);

    // Actually copy the files to public/sites/[deployId] to make them browsable!
    try {
      const destDir = path.join(__dirname, 'public', 'sites', deployId);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'public', 'index.html'), path.join(destDir, 'index.html'));
      fs.copyFileSync(path.join(__dirname, 'public', 'style.css'), path.join(destDir, 'style.css'));
      fs.copyFileSync(path.join(__dirname, 'public', 'app.js'), path.join(destDir, 'app.js'));
    } catch (err) {
      console.error('Failed to copy preview files:', err);
    }

    await pushLog(deployId, 'Uploading: index.html (33 KB)', 'log');
    await sleep(200);
    await pushLog(deployId, 'Uploading: style.css (28 KB)', 'log');
    await sleep(200);
    await pushLog(deployId, 'Uploading: app.js (9 KB)', 'log');
    await sleep(300);
    await pushLog(deployId, '✓ 3 files uploaded to CDN', 'success');

    await pushLog(deployId, '─────────────────────────────────', 'divider');
    await pushLog(deployId, 'Propagating to 100+ edge regions...', 'info');
    await sleep(800);
    await pushLog(deployId, '✓ Edge propagation complete', 'success');

    await pushLog(deployId, '─────────────────────────────────', 'divider');
    await pushLog(deployId, 'Assigning deployment URL...', 'info');
    await sleep(400);

    const deployUrl = `http://localhost:${PORT}/sites/${deployId}/index.html`;
    await pushLog(deployId, `✓ Deployment URL: ${deployUrl}`, 'success');

    await pushLog(deployId, '─────────────────────────────────', 'divider');
    const dbDeploy = await Deployment.findOne({ id: deployId });
    const started = dbDeploy ? dbDeploy.startedAt : new Date();
    const elapsed = ((Date.now() - new Date(started).getTime()) / 1000).toFixed(1);
    await pushLog(deployId, `🚀 Deployment complete in ${elapsed}s`, 'done');
    await pushLog(deployId, `Live at: ${deployUrl}`, 'url');

    await finishDeployment(deployId, true);
  } catch (err) {
    await pushLog(deployId, `Error: ${err.message}`, 'error');
    await finishDeployment(deployId, false);
  }
}

// ===================================================
//   ROUTES
// ===================================================

// ===== SERVE PAGES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/deploy/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'deploy.html')));
app.get('/import', (req, res) => res.sendFile(path.join(__dirname, 'public', 'import.html')));

// ===== AUTH STATUS =====
app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  try {
    const user = await User.findOne({ id: req.session.userId });
    if (!user) return res.json({ authenticated: false });
    res.json({
      authenticated: true,
      user: { id: user.id, login: user.login, name: user.name, avatar: user.avatar, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ===== GITHUB OAUTH =====
app.get('/api/auth/github', async (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    // Demo mode — create a mock user
    const mockId = 'demo-user';
    try {
      await User.findOneAndUpdate(
        { id: mockId },
        { 
          id: mockId, 
          login: 'demo-user', 
          name: 'Demo Developer',
          avatar: 'https://avatars.githubusercontent.com/u/0?v=4',
          token: 'demo-token', 
          email: 'demo@deployify.app' 
        },
        { upsert: true, new: true }
      );
      req.session.userId = mockId;
      return res.redirect('/dashboard');
    } catch (err) {
      return res.redirect('/?error=db_error');
    }
  }
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${BASE_URL}/api/auth/github/callback`,
    scope: 'repo user:email read:org',
    state: uuidv4()
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get('/api/auth/github/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=oauth_denied');

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/?error=token_failed');

    // Get user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'Deployify' }
    });
    const githubUser = await userRes.json();

    const userId = String(githubUser.id);
    await User.findOneAndUpdate(
      { id: userId },
      { 
        id: userId, 
        login: githubUser.login, 
        name: githubUser.name || githubUser.login,
        avatar: githubUser.avatar_url, 
        token: tokenData.access_token,
        email: githubUser.email || '' 
      },
      { upsert: true }
    );
    
    req.session.userId = userId;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?error=oauth_error');
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ===== GITHUB REPOS =====
app.get('/api/github/repos', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.session.userId });
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.token === 'demo-token') {
      // Return demo repos
      return res.json([
        { id: 1, name: 'DEVFLOW', full_name: 'itkhent-debug/DEVFLOW', description: 'Deployify clone website', private: false, default_branch: 'main', language: 'HTML', updated_at: new Date().toISOString(), stargazers_count: 3 },
        { id: 2, name: 'my-portfolio', full_name: 'demo-user/my-portfolio', description: 'Personal portfolio site', private: false, default_branch: 'main', language: 'JavaScript', updated_at: new Date().toISOString(), stargazers_count: 7 },
        { id: 3, name: 'next-blog', full_name: 'demo-user/next-blog', description: 'Blog built with Next.js', private: false, default_branch: 'main', language: 'TypeScript', updated_at: new Date().toISOString(), stargazers_count: 12 },
        { id: 4, name: 'react-dashboard', full_name: 'demo-user/react-dashboard', description: 'Admin dashboard template', private: true, default_branch: 'main', language: 'JavaScript', updated_at: new Date().toISOString(), stargazers_count: 0 },
      ]);
    }

    const reposRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50&type=owner', {
      headers: { Authorization: `Bearer ${user.token}`, 'User-Agent': 'Deployify', 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!reposRes.ok) return res.status(500).json({ error: 'Failed to fetch repos' });
    const repos = await reposRes.json();
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: 'GitHub API error' });
  }
});

// ===== PROJECTS =====
app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const projects = await Project.find({ userId }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const project = await Project.findOne({ id: req.params.id, userId: req.session.userId });
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ===== IMPORT REPO & CREATE PROJECT =====
app.post('/api/projects', requireAuth, async (req, res) => {
  const { repoFullName, branch, framework } = req.body;
  if (!repoFullName) return res.status(400).json({ error: 'repoFullName required' });

  try {
    const projectId = uuidv4();
    const repoName = repoFullName.split('/')[1] || repoFullName;
    const deployId = uuidv4();

    const project = new Project({
      id: projectId,
      name: repoName,
      repo: repoFullName,
      branch: branch || 'main',
      framework: framework || 'Static HTML',
      userId: req.session.userId,
      status: 'queued',
      url: null,
      deployments: [deployId],
      lastDeployId: deployId,
    });
    await project.save();

    // Trigger first deployment
    const deployment = new Deployment({
      id: deployId,
      projectId,
      status: 'queued',
      logs: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: null,
      commit: 'HEAD',
      commitMsg: 'Initial deployment',
      branch: branch || 'main',
      url: null,
    });
    await deployment.save();

    res.json({ project, deployId });

    // Start deploy in background
    setTimeout(() => simulateDeploy(deployId, repoFullName, branch || 'main', framework), 200);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ===== REDEPLOY =====
app.post('/api/projects/:id/deploy', requireAuth, async (req, res) => {
  try {
    const project = await Project.findOne({ id: req.params.id, userId: req.session.userId });
    if (!project) return res.status(404).json({ error: 'Not found' });

    const deployId = uuidv4();
    const deployment = new Deployment({
      id: deployId,
      projectId: project.id,
      status: 'queued',
      logs: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: null,
      commit: 'HEAD~0',
      commitMsg: 'Manual redeploy',
      branch: project.branch,
      url: null,
    });
    await deployment.save();

    await Project.updateOne(
      { id: project.id }, 
      { 
        $push: { deployments: deployId },
        status: 'building',
        lastDeployId: deployId
      }
    );

    res.json({ deployId });
    setTimeout(() => simulateDeploy(deployId, project.repo, project.branch, project.framework), 200);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ===== DEPLOYMENTS =====
app.get('/api/deployments/:id', requireAuth, async (req, res) => {
  try {
    const deploy = await Deployment.findOne({ id: req.params.id });
    if (!deploy) return res.status(404).json({ error: 'Not found' });
    const project = await Project.findOne({ id: deploy.projectId });
    if (!project || project.userId !== req.session.userId) return res.status(403).json({ error: 'Forbidden' });
    res.json(deploy);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ===== LIVE LOGS via Server-Sent Events =====
app.get('/api/deployments/:id/logs/stream', requireAuth, async (req, res) => {
  const deployId = req.params.id;
  try {
    const deploy = await Deployment.findOne({ id: deployId });
    if (!deploy) return res.status(404).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send existing logs immediately
    deploy.logs.forEach(log => {
      res.write(`data: ${JSON.stringify({ log })}\n\n`);
    });

    // If already finished, send final status and close
    if (deploy.status === 'ready' || deploy.status === 'error') {
      res.write(`data: ${JSON.stringify({ status: deploy.status, url: deploy.url, duration: deploy.duration })}\n\n`);
      return res.end();
    }

    // Register as SSE client
    if (!db.sseClients[deployId]) db.sseClients[deployId] = [];
    db.sseClients[deployId].push(res);

    // Cleanup on disconnect
    req.on('close', () => {
      if (db.sseClients[deployId]) {
        db.sseClients[deployId] = db.sseClients[deployId].filter(c => c !== res);
      }
    });
  } catch (err) {
    res.status(500).end();
  }
});

// ===== HEALTH =====
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), env: process.env.NODE_ENV || 'development' }));

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log('\n🚀 ======================================');
  console.log(`   Deployify Server running with MongoDB!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   GitHub OAuth: ${GITHUB_CLIENT_ID ? '✅ Configured' : '⚠️  Demo mode (no OAuth)'}`);
  console.log('=========================================\n');
});
