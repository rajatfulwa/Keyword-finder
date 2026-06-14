/**
 * scout.js — AI Scout Engine for MicroFinder
 * v3 — Added: Domain Finder (RDAP), Revenue Estimate, Frequency Signal
 */

(function () {
  "use strict";

  // ─── Constants ───────────────────────────────────────────────────────────────
  const NIM_ENDPOINT   = "/api/nim";
  const RDAP_ENDPOINT  = "/api/rdap";
  const LS_KEY_APIKEY  = "microfinder_nim_key";
  const LS_KEY_RESULTS = "microfinder_scout_results";
  const LS_KEY_SETTINGS = "microfinder_scout_settings";

  // CPM heuristics by audience/niche (USD per 1000 ad impressions)
  const CPM_MAP = {
    developer:  14, finance: 18, productivity: 9,
    marketing:  12, saas: 11,   general: 7
  };

  // Stop-words stripped before domain slug generation
  const STOP_WORDS = new Set([
    "a","an","the","for","and","or","to","of","in","on","at","by",
    "from","with","that","this","is","it","as","be","my","your"
  ]);

  // ─── State ────────────────────────────────────────────────────────────────────
  let scoutState = {
    scanning:  false,
    results:   [],
    dismissed: new Set(),
    sortBy:    "rank",
    settings: {
      temperature: 0.2,
      redditLimit: 15,
      hnPoints: 10,
      customPrompt: ""
    }
  };

  // ─── DOM refs ─────────────────────────────────────────────────────────────────
  const nimKeyInput      = document.getElementById("nim-api-key");
  const btnToggleKey     = document.getElementById("btn-toggle-key");
  const eyeIcon          = document.getElementById("eye-icon");
  const btnSaveKey       = document.getElementById("btn-save-key");
  const statusDot        = document.getElementById("status-dot");
  const statusLabel      = document.getElementById("status-label");
  const srcReddit        = document.getElementById("src-reddit");
  const srcHN            = document.getElementById("src-hn");
  const scoutTopic       = document.getElementById("scout-topic");
  const nimModel         = document.getElementById("nim-model");
  const btnScan          = document.getElementById("btn-scan");
  const scoutProgress    = document.getElementById("scout-progress");
  const progressLabel    = document.getElementById("progress-label");
  const progressLog      = document.getElementById("progress-log");
  const scoutStats       = document.getElementById("scout-stats");
  const statPostsScanned = document.getElementById("stat-posts-scanned");
  const statIdeasFound   = document.getElementById("stat-ideas-found");
  const resultsGrid      = document.getElementById("scout-results-grid");
  const scoutEmpty       = document.getElementById("scout-empty");
  const sortSelect       = document.getElementById("scout-sort");
  const btnExportCsv     = document.getElementById("btn-export-csv");
  const btnClearSaved    = document.getElementById("btn-clear-saved");
  
  const btnToggleSettings = document.getElementById("btn-toggle-scout-settings");
  const settingsPanel     = document.getElementById("scout-settings-panel");
  const scoutTemp         = document.getElementById("scout-temp");
  const scoutTempVal      = document.getElementById("scout-temp-val");
  const scoutRedditLimit  = document.getElementById("scout-reddit-limit");
  const scoutHnPoints     = document.getElementById("scout-hn-points");
  const scoutCustomPrompt = document.getElementById("scout-custom-prompt");

  // ─── Settings Persistence ───────────────────────────────────────────────────
  function loadSavedSettings() {
    try {
      const saved = localStorage.getItem(LS_KEY_SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        scoutState.settings = { ...scoutState.settings, ...parsed };
        
        if (scoutTemp) {
          scoutTemp.value = scoutState.settings.temperature;
          scoutTempVal.textContent = scoutState.settings.temperature;
        }
        if (scoutRedditLimit) scoutRedditLimit.value = scoutState.settings.redditLimit;
        if (scoutHnPoints) scoutHnPoints.value = scoutState.settings.hnPoints;
        if (scoutCustomPrompt) scoutCustomPrompt.value = scoutState.settings.customPrompt;
      }
    } catch (_) {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(scoutState.settings));
    } catch (_) {}
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    if (window.location.search.includes("mock=true")) {
      const mockData = [
        {
          id: "scout-mock-1",
          title: "API Key Rotator",
          problem: "Developers struggle to rotate their API keys periodically without breaking production workflows, leading to security risks.",
          opportunity: "A dashboard that schedules key rotation, verifies the new keys, and updates secret managers automatically.",
          painScore: 9,
          devDays: 3,
          competitionLevel: "Low",
          monetizationPotential: "High",
          estimatedUsers: "Medium",
          tags: ["developer", "security", "api"],
          source: "hackernews",
          postUrl: "https://news.ycombinator.com/item?id=123",
          postTitle: "Ask HN: How do you rotate your production API keys?",
          scannedAt: new Date().toISOString(),
          trending: true
        },
        {
          id: "scout-mock-2",
          title: "PDF Size Optimizer 200KB",
          problem: "Job applicants need to shrink resume PDFs to under 200KB to meet ATS limits, but online compressors ruin quality or require subscriptions.",
          opportunity: "A client-side high-quality PDF compressor tailored specifically for PDF resume size limits.",
          painScore: 8,
          devDays: 1,
          competitionLevel: "Medium",
          monetizationPotential: "Low",
          estimatedUsers: "Large",
          tags: ["utilities", "pdf", "jobsearch"],
          source: "reddit",
          subreddit: "jobs",
          postUrl: "https://reddit.com/r/jobs/comments/abc",
          postTitle: "Why is it so hard to get a PDF resume under 200KB?",
          scannedAt: new Date().toISOString(),
          trending: false
        }
      ];
      localStorage.setItem(LS_KEY_RESULTS, JSON.stringify(mockData));
    }
    loadSavedSettings();
    loadSavedKey();
    loadPersistedResults();
    bindEvents();
  }

  function bindEvents() {
    btnSaveKey.addEventListener("click", saveKey);
    btnToggleKey.addEventListener("click", toggleKeyVisibility);
    btnScan.addEventListener("click", startScan);
    scoutTopic.addEventListener("keydown", (e) => { if (e.key === "Enter") startScan(); });
    sortSelect?.addEventListener("change", onSortChange);
    btnExportCsv?.addEventListener("click", exportCSV);
    btnClearSaved?.addEventListener("click", clearSaved);

    btnToggleSettings?.addEventListener("click", () => {
      settingsPanel.classList.toggle("hidden");
    });
    
    scoutTemp?.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      scoutTempVal.textContent = val.toFixed(1);
      scoutState.settings.temperature = val;
      saveSettings();
    });

    scoutRedditLimit?.addEventListener("change", (e) => {
      scoutState.settings.redditLimit = Math.max(5, Math.min(50, parseInt(e.target.value, 10) || 15));
      saveSettings();
    });

    scoutHnPoints?.addEventListener("change", (e) => {
      scoutState.settings.hnPoints = Math.max(5, Math.min(200, parseInt(e.target.value, 10) || 10));
      saveSettings();
    });

    scoutCustomPrompt?.addEventListener("input", (e) => {
      scoutState.settings.customPrompt = e.target.value;
      saveSettings();
    });
  }

  // ─── API Key Management ───────────────────────────────────────────────────────
  function loadSavedKey() {
    const saved = localStorage.getItem(LS_KEY_APIKEY);
    if (saved) { nimKeyInput.value = saved; setKeyStatus(true); }
  }

  function saveKey() {
    const key = nimKeyInput.value.trim();
    if (!key || !key.startsWith("nvapi-")) {
      shakeElement(nimKeyInput);
      showToast("Key must start with 'nvapi-'", "error");
      return;
    }
    localStorage.setItem(LS_KEY_APIKEY, key);
    setKeyStatus(true);
    showToast("API key saved!", "success");
  }

  function setKeyStatus(connected) {
    statusDot.className     = connected ? "status-dot connected" : "status-dot";
    statusLabel.textContent = connected ? "Key saved" : "No key saved";
  }

  function toggleKeyVisibility() {
    const isPassword = nimKeyInput.type === "password";
    nimKeyInput.type = isPassword ? "text" : "password";
    eyeIcon.setAttribute("data-lucide", isPassword ? "eye-off" : "eye");
    lucide.createIcons();
  }

  // ─── Persistence ─────────────────────────────────────────────────────────────
  function persistResults() {
    try { localStorage.setItem(LS_KEY_RESULTS, JSON.stringify(scoutState.results)); } catch (_) {}
  }

  function loadPersistedResults() {
    try {
      const raw = localStorage.getItem(LS_KEY_RESULTS);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length > 0) {
        scoutState.results = saved;
        showToolbar(saved.length, "—");
        scoutEmpty.style.display = "none";
        renderAllCards();
        showToast(`${saved.length} saved ideas restored`, "info");
      }
    } catch (_) {}
  }

  function clearSaved() {
    if (!confirm("Clear all saved Scout results?")) return;
    localStorage.removeItem(LS_KEY_RESULTS);
    scoutState.results = [];
    scoutState.dismissed.clear();
    resultsGrid.innerHTML = "";
    scoutStats.classList.add("hidden");
    document.getElementById("rank-legend")?.classList.add("hidden");
    scoutEmpty.style.display = "flex";
    showToast("Results cleared", "success");
  }

  function showToolbar(ideasCount, postsCount) {
    scoutStats.classList.remove("hidden");
    document.getElementById("rank-legend")?.classList.remove("hidden");
    statIdeasFound.textContent   = ideasCount;
    statPostsScanned.textContent = postsCount;
  }

  // ─── Ranking Engine ───────────────────────────────────────────────────────────
  function calcOpportunityScore(idea) {
    const painPct  = (idea.painScore / 10) * 100;
    const devPct   = Math.max(10, 100 - ((idea.devDays || 3) - 1) * 7.5);
    const compMap  = { "Low": 100, "Medium": 50, "High": 15 };
    const compPct  = compMap[idea.competitionLevel] ?? 50;
    const monoMap  = { "High": 100, "Medium": 60, "Low": 20 };
    const monoPct  = monoMap[idea.monetizationPotential] ?? 60;
    return Math.round(Math.min(100, Math.max(0,
      (painPct * 0.35) + (devPct * 0.30) + (compPct * 0.25) + (monoPct * 0.10)
    )));
  }

  function rankResults(results) {
    return [...results]
      .filter(r => !scoutState.dismissed.has(r.id))
      .map(r => ({ ...r, opportunityScore: calcOpportunityScore(r) }))
      .sort((a, b) => {
        switch (scoutState.sortBy) {
          case "pain":        return b.painScore - a.painScore;
          case "devtime":     return (a.devDays || 3) - (b.devDays || 3);
          case "competition": {
            const o = { "Low": 0, "Medium": 1, "High": 2 };
            return (o[a.competitionLevel] ?? 1) - (o[b.competitionLevel] ?? 1);
          }
          default:            return b.opportunityScore - a.opportunityScore;
        }
      });
  }

  function onSortChange() {
    scoutState.sortBy = sortSelect.value;
    renderAllCards();
  }

  // ─── Revenue Estimate ─────────────────────────────────────────────────────────
  function estimateRevenue(idea) {
    const volMap   = { "Large": 50000, "Medium": 18000, "Niche": 7000 };
    const vol      = (volMap[idea.estimatedUsers] || 15000) * (idea.painScore / 8);
    // Estimate topic CPM from tags
    let cpm = CPM_MAP.general;
    const tagStr = (idea.tags || []).join(" ").toLowerCase() + " " + (idea.title || "").toLowerCase();
    if (/dev|code|api|sql|js|css/.test(tagStr))     cpm = CPM_MAP.developer;
    else if (/finance|tax|invoice|budget/.test(tagStr)) cpm = CPM_MAP.finance;
    else if (/seo|market|content|rank/.test(tagStr))    cpm = CPM_MAP.marketing;
    else if (/product|saas|startup/.test(tagStr))       cpm = CPM_MAP.saas;
    else if (/productiv|todo|plan|task/.test(tagStr))   cpm = CPM_MAP.productivity;
    // Simple model: 2 pageviews per visitor, 60% ad fill rate
    const monthlyRev = (vol * 2 * 0.6 * cpm) / 1000;
    const lo = Math.round(monthlyRev * 0.4);
    const hi = Math.round(monthlyRev * 1.1);
    return { lo, hi, cpm };
  }

  // ─── Frequency Signal ─────────────────────────────────────────────────────────
  function addFrequencySignals(results) {
    // Group by tag similarity — if 2+ results share the same top tag, mark as trending
    const tagCounts = {};
    results.forEach(r => {
      (r.tags || []).forEach(tag => {
        const t = tag.toLowerCase().trim();
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    return results.map(r => {
      const trendingTag = (r.tags || []).find(t => tagCounts[t.toLowerCase().trim()] >= 2);
      return { ...r, trending: !!trendingTag, trendingTag: trendingTag || null };
    });
  }

  // ─── Domain Suggestion Engine ─────────────────────────────────────────────────
  function generateDomainSuggestions(title) {
    const words = title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));

    if (!words.length) return [];

    const slug      = words.join("");
    const hyphen    = words.join("-");
    const shortSlug = words.slice(0, 2).join("");

    const candidates = [
      slug + ".com",
      hyphen + ".com",
      "get" + slug + ".com",
      "try" + slug + ".com",
      slug + "app.com",
      slug + ".io",
      slug + ".app",
      shortSlug + ".com",
      shortSlug + "tool.com",
      "use" + slug + ".com"
    ];

    // De-duplicate, remove ones that are too long (>20 chars before TLD)
    const seen = new Set();
    return candidates.filter(d => {
      const [name] = d.split(".");
      if (seen.has(d) || name.length < 4 || name.length > 22) return false;
      seen.add(d);
      return true;
    }).slice(0, 7);
  }

  async function checkDomainAvailabilityClientSide(domain) {
    if (!domain || !domain.match(/^[a-z0-9][a-z0-9\-]*\.[a-z]{2,}$/i)) {
      return { available: null, domain, error: "invalid" };
    }
    const parts = domain.split(".");
    const tld = parts[parts.length - 1].toLowerCase();

    let rdapBase = "https://rdap.org/domain/";
    switch (tld) {
      case "com":
      case "net":
        rdapBase = "https://rdap.verisign.com/com/v1/domain/";
        break;
      case "io":
        rdapBase = "https://rdap.nic.io/domain/";
        break;
      case "app":
        rdapBase = "https://rdap.nic.app/domain/";
        break;
      case "co":
        rdapBase = "https://rdap.nic.co/domain/";
        break;
      case "dev":
        rdapBase = "https://rdap.nic.dev/domain/";
        break;
      case "org":
        rdapBase = "https://rdap.publicinterestregistry.org/rdap/domain/";
        break;
    }

    const rdapUrl = rdapBase + encodeURIComponent(domain);
    try {
      const resp = await fetchWithCorsProxy(rdapUrl);
      if (resp.status === 200) {
        return { available: false, domain };
      } else if (resp.status === 404) {
        return { available: true, domain };
      } else {
        return { available: null, domain, error: `status_${resp.status}` };
      }
    } catch (e) {
      return { available: null, domain, error: "timeout" };
    }
  }

  async function checkDomainAvailability(domain) {
    let fallbackToClient = false;
    try {
      const resp = await fetch(`${RDAP_ENDPOINT}?domain=${encodeURIComponent(domain)}`);
      if (!resp.ok) {
        fallbackToClient = true;
      } else {
        const data = await resp.json();
        return data;
      }
    } catch (e) {
      fallbackToClient = true;
    }

    if (fallbackToClient) {
      return await checkDomainAvailabilityClientSide(domain);
    }
  }

  // ─── Main Scan Orchestrator ───────────────────────────────────────────────────
  async function startScan() {
    if (scoutState.scanning) return;

    const apiKey = localStorage.getItem(LS_KEY_APIKEY);
    if (!apiKey) {
      shakeElement(nimKeyInput);
      showToast("Please save your NVIDIA NIM API key first.", "error");
      return;
    }
    if (!srcReddit.checked && !srcHN.checked) {
      showToast("Select at least one data source.", "error");
      return;
    }

    const topic = scoutTopic.value.trim() || "developer tools";
    const model = nimModel.value;

    scoutState.scanning = true;
    scoutState.results  = [];
    scoutState.dismissed.clear();
    btnScan.disabled    = true;
    btnScan.querySelector("span").textContent = "Scanning...";
    scoutEmpty.style.display = "none";
    resultsGrid.innerHTML    = "";
    scoutStats.classList.add("hidden");
    document.getElementById("rank-legend")?.classList.add("hidden");
    showProgress(true, "Fetching posts from sources...");

    try {
      let allPosts = [];

      if (srcReddit.checked) {
        logProgress(`🔍 Scanning Reddit for "${topic}"...`);
        const posts = await fetchRedditPosts(topic);
        allPosts = allPosts.concat(posts);
        logProgress(`✓ Reddit: ${posts.length} posts collected`);
        statPostsScanned.textContent = allPosts.length;
      }

      if (srcHN.checked) {
        logProgress("🔍 Scanning Hacker News...");
        const posts = await fetchHNPosts(topic);
        allPosts = allPosts.concat(posts);
        logProgress(`✓ Hacker News: ${posts.length} posts collected`);
        statPostsScanned.textContent = allPosts.length;
      }

      if (allPosts.length === 0) throw new Error("No posts found. Try a broader topic.");

      logProgress(`📊 ${allPosts.length} posts → NVIDIA NIM AI...`);
      updateProgressLabel(`Analyzing with ${model.split("/")[1]}...`);

      const batches = chunkArray(allPosts, 8);
      for (let i = 0; i < batches.length; i++) {
        updateProgressLabel(`Analyzing batch ${i + 1} of ${batches.length}...`);
        logProgress(`⚡ Batch ${i + 1}/${batches.length} → NIM...`);
        const ideas = await analyzeWithNIM(batches[i], topic, model, apiKey);
        scoutState.results.push(...ideas);
        logProgress(`✓ Batch ${i + 1} done: ${ideas.length} ideas`);
        if (i < batches.length - 1) await sleep(500);
      }

      // Post-process: add frequency signals
      scoutState.results = addFrequencySignals(scoutState.results);

      showToolbar(scoutState.results.length, allPosts.length);
      renderAllCards();
      persistResults();

      logProgress(`🎯 Scan complete! ${scoutState.results.length} ideas found & saved.`);
      updateProgressLabel("Scan complete!");
      setTimeout(() => showProgress(false), 2000);

    } catch (err) {
      console.error("[Scout] Error:", err);
      logProgress(`❌ ${err.message}`);
      updateProgressLabel("Scan failed");
      showErrorCard(err.message);
      setTimeout(() => showProgress(false), 3000);
    } finally {
      scoutState.scanning = false;
      btnScan.disabled    = false;
      btnScan.querySelector("span").textContent = "Start Scan";
      lucide.createIcons();
      if (scoutState.results.length === 0) scoutEmpty.style.display = "flex";
    }
  }

  // ─── Reddit Fetcher ───────────────────────────────────────────────────────────
  async function fetchRedditPosts(topic) {
    const posts = [];
    const subs  = pickSubreddits(topic).slice(0, 3);
    for (const sub of subs) {
      try {
        const url  = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(topic)}&sort=top&t=month&limit=${scoutState.settings.redditLimit}&restrict_sr=true`;
        const resp = await fetchWithCorsProxy(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        (data?.data?.children || []).forEach(post => {
          const d = post.data;
          if (d.score > 10 && d.title) {
            posts.push({
              source: "reddit", subreddit: d.subreddit,
              title: d.title.substring(0, 200),
              body:  (d.selftext || "").substring(0, 150),
              score: d.score, comments: d.num_comments,
              url: `https://reddit.com${d.permalink}`
            });
          }
        });
      } catch (e) { console.warn(`[Scout] r/${sub}:`, e.message); }
    }
    return posts.slice(0, 40);
  }

  function pickSubreddits(topic) {
    const t = topic.toLowerCase();
    if (/dev|code|software|program/.test(t))    return ["webdev", "programming", "SideProject", "learnprogramming", "startups"];
    if (/finance|money|budget|invest/.test(t))  return ["personalfinance", "financialindependence", "SideProject", "entrepreneur", "smallbusiness"];
    if (/market|seo|content|social/.test(t))    return ["SEO", "marketing", "SideProject", "entrepreneur", "smallbusiness"];
    if (/product|saas|startup/.test(t))         return ["SideProject", "indiehackers", "startups", "entrepreneur", "SaaS"];
    return ["SideProject", "entrepreneur", "productivity", "startups", "indiehackers"];
  }

  // ─── HN Fetcher ───────────────────────────────────────────────────────────────
  async function fetchHNPosts(topic) {
    const posts = [];
    try {
      const url  = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=(ask_hn,show_hn)&hitsPerPage=30&numericFilters=points>${scoutState.settings.hnPoints}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HN ${resp.status}`);
      const data = await resp.json();
      (data.hits || []).forEach(h => posts.push({
        source: "hackernews", subreddit: null,
        title: (h.title || "").substring(0, 200),
        body:  (h.story_text || h.comment_text || "").substring(0, 150),
        score: h.points || 0, comments: h.num_comments || 0,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`
      }));
    } catch (e) { console.warn("[Scout] HN:", e.message); }
    return posts;
  }

  // ─── NVIDIA NIM Analysis ──────────────────────────────────────────────────────
  async function analyzeWithNIM(posts, topic, model, apiKey) {
    const postsText = posts.map((p, i) => {
      const src = p.source === "reddit" ? `r/${p.subreddit}` : "HackerNews";
      return `[Post ${i+1}] Source: ${src} | Score: ${p.score} | Title: ${p.title}${p.body ? " | Details: " + p.body : ""}`;
    }).join("\n");

    const systemPrompt = `You are a micro-SaaS opportunity analyst. Identify REAL, ACTIONABLE pain points from community posts that could be solved with a focused web tool.
Focus on: specific & well-defined problems, frequent pain, no good free solution, buildable in days.
IMPORTANT: Respond ONLY with valid JSON array. No markdown, no explanation.`;

    let customPromptText = "";
    if (scoutState.settings.customPrompt && scoutState.settings.customPrompt.trim() !== "") {
      customPromptText = `\nADDITIONAL INSTRUCTIONS / FILTER GUIDELINES:\n${scoutState.settings.customPrompt.trim()}\n`;
    }

    const userPrompt = `Topic: "${topic}"
Posts:
${postsText}
${customPromptText}

Extract 2-5 genuine micro-SaaS opportunities as JSON:
[
  {
    "title": "Short tool name (5 words max)",
    "problem": "1-2 sentences: exact pain point",
    "opportunity": "1 sentence: what the tool does",
    "painScore": <1-10>,
    "devDays": <1, 2, 3, 5, 7, or 14>,
    "competitionLevel": "<Low|Medium|High>",
    "monetizationPotential": "<Low|Medium|High>",
    "estimatedUsers": "<Niche|Medium|Large>",
    "sourceIndex": <post index 1-${posts.length}>,
    "tags": ["tag1", "tag2", "tag3"]
  }
]
devDays: 1=calculator, 2-3=file handling, 5=complex UI, 7+=multi-feature.
competitionLevel: Low=few good free tools, Medium=some ok tools, High=saturated.
monetizationPotential: High=pro users/high CPM, Medium=general users, Low=hobbyist.
Return [] if no strong opportunities found.`;

    const NIM_TIMEOUT = 90000; // 90s for LLM inference
    const MAX_RETRIES = 2;
    let response;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 3000;
        logProgress(`⏳ Retry ${attempt}/${MAX_RETRIES} after ${delay / 1000}s...`);
        await sleep(delay);
      }

      let fallbackToDirect = false;
      try {
        response = await fetchWithTimeout(NIM_ENDPOINT, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model, temperature: scoutState.settings.temperature, max_tokens: 1024, top_p: 0.7, stream: false,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: userPrompt }
            ]
          })
        }, NIM_TIMEOUT);
        if (!response.ok && response.status !== 401 && response.status !== 429) {
          fallbackToDirect = true;
        }
      } catch (e) {
        fallbackToDirect = true;
      }

      if (fallbackToDirect) {
        if (attempt === 0) logProgress("📡 Local server API offline; trying direct query to NVIDIA NIM API...");
        try {
          response = await fetchWithCorsProxy("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model, temperature: scoutState.settings.temperature, max_tokens: 1024, top_p: 0.7, stream: false,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user",   content: userPrompt }
              ]
            })
          }, NIM_TIMEOUT);
        } catch (directErr) {
          lastError = directErr;
          if (attempt < MAX_RETRIES) continue; // retry
          throw new Error(`Connection failed after ${MAX_RETRIES + 1} attempts: ${directErr.message}`);
        }
      }

      // Check for retryable server errors
      if (response && (response.status === 502 || response.status === 503 || response.status === 504)) {
        lastError = new Error(`Server returned ${response.status}`);
        logProgress(`⚠️ Server returned ${response.status} (gateway error)`);
        if (attempt < MAX_RETRIES) continue; // retry
      }

      // Got a definitive response (success or non-retryable error)
      break;
    }

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401) throw new Error("Invalid NIM API key.");
      if (response.status === 429) throw new Error("Rate limit hit. Wait a moment.");
      throw new Error(`NIM error ${response.status}: ${err.substring(0, 80)}`);
    }

    const data    = await response.json();
    const content = data?.choices?.[0]?.message?.content || "[]";

    let ideas = [];
    try {
      const cleaned    = content.replace(/```json?\n?/gi, "").replace(/```/g, "").trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) ideas = JSON.parse(arrayMatch[0]);
    } catch (e) {
      console.warn("[Scout] JSON parse failed:", content.substring(0, 200));
    }

    return ideas.map((idea, idx) => {
      const srcPost = posts[Math.max(0, (idea.sourceIndex || 1) - 1)];
      const enriched = {
        id:                    `scout-${Date.now()}-${idx}`,
        title:                 idea.title                || "Unnamed Opportunity",
        problem:               idea.problem              || "",
        opportunity:           idea.opportunity          || "",
        painScore:             clamp(idea.painScore, 1, 10),
        devDays:               [1,2,3,5,7,14].includes(idea.devDays) ? idea.devDays : 3,
        competitionLevel:      ["Low","Medium","High"].includes(idea.competitionLevel)       ? idea.competitionLevel       : "Medium",
        monetizationPotential: ["Low","Medium","High"].includes(idea.monetizationPotential)  ? idea.monetizationPotential  : "Medium",
        estimatedUsers:        ["Niche","Medium","Large"].includes(idea.estimatedUsers)       ? idea.estimatedUsers          : "Medium",
        tags:                  Array.isArray(idea.tags) ? idea.tags : [],
        source:                srcPost?.source    || "unknown",
        subreddit:             srcPost?.subreddit || null,
        postUrl:               srcPost?.url       || null,
        postTitle:             srcPost?.title     || "",
        scannedAt:             new Date().toISOString()
      };
      enriched.opportunityScore = calcOpportunityScore(enriched);
      return enriched;
    });
  }

  // ─── Card Rendering ───────────────────────────────────────────────────────────
  function renderAllCards() {
    resultsGrid.innerHTML = "";
    const ranked = rankResults(scoutState.results);
    ranked.forEach((idea, i) => renderSingleCard(idea, i + 1));
    lucide.createIcons();
  }

  function renderSingleCard(idea, rank) {
    const score     = idea.opportunityScore;
    const scoreCat  = score >= 70 ? "high" : score >= 45 ? "medium" : "low";
    const scoreEmoji= score >= 70 ? "🏆" : score >= 45 ? "⚡" : "📉";
    const rankBadge = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

    const compColor = { Low:"var(--color-emerald)", Medium:"var(--color-amber)", High:"var(--color-rose)" };
    const compBg    = { Low:"var(--color-emerald-glow)", Medium:"rgba(245,158,11,0.1)", High:"var(--color-rose-glow)" };
    const devLabel  = idea.devDays === 1 ? "~1 day" : idea.devDays <= 3 ? `~${idea.devDays} days` : idea.devDays <= 7 ? `~${idea.devDays} days` : "~2 weeks";
    const devColor  = idea.devDays <= 2 ? "var(--color-emerald)" : idea.devDays <= 5 ? "var(--color-amber)" : "var(--color-rose)";

    const srcClass  = idea.source === "reddit" ? "reddit" : "hackernews";
    const srcLabel  = idea.source === "reddit"
      ? `<i data-lucide="message-square"></i> r/${idea.subreddit || "reddit"}`
      : `<i data-lucide="terminal"></i> Hacker News`;

    // Revenue estimate
    const rev       = estimateRevenue(idea);
    const revLabel  = rev.hi < 10 ? `<$10/mo` : `$${rev.lo}–$${rev.hi}/mo`;

    // Trending badge
    const trendHtml = idea.trending
      ? `<span class="scout-trending-badge">🔥 Trending</span>`
      : "";

    const tagsHtml  = (idea.tags || []).slice(0, 3).map(t =>
      `<span class="scout-tag">${escapeHtml(t)}</span>`
    ).join("");

    // Domain slug for suggestions
    const domainSlug = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const cardId     = "card-" + idea.id;

    const card = document.createElement("div");
    card.className  = "scout-card";
    card.dataset.id = idea.id;
    card.id         = cardId;

    card.innerHTML = `
      <div class="scout-rank-bar">
        <div class="scout-rank-left">
          <span class="scout-rank-badge">${rankBadge}</span>
          ${trendHtml}
        </div>
        <div class="scout-opp-score ${scoreCat}">
          <span class="opp-score-val">${score}</span>
          <span class="opp-score-label">${scoreEmoji} Opp. Score</span>
        </div>
      </div>

      <div class="scout-card-header">
        <span class="scout-source-badge ${srcClass}">${srcLabel}</span>
        <span class="scout-pain-score ${idea.painScore >= 8 ? "high" : idea.painScore >= 5 ? "medium" : "low"}">
          🔥 Pain ${idea.painScore}/10
        </span>
      </div>

      <h3>${escapeHtml(idea.title)}</h3>
      <p class="scout-problem-desc">${escapeHtml(idea.problem)}</p>

      <div class="scout-rank-metrics">
        <div class="rank-metric">
          <i data-lucide="clock"></i>
          <span>Build time</span>
          <strong style="color:${devColor}">${devLabel}</strong>
        </div>
        <div class="rank-metric">
          <i data-lucide="shield"></i>
          <span>Competition</span>
          <strong style="color:${compColor[idea.competitionLevel]||"var(--color-amber)"};background:${compBg[idea.competitionLevel]||"transparent"};padding:0.1rem 0.4rem;border-radius:4px">${idea.competitionLevel}</strong>
        </div>
        <div class="rank-metric">
          <i data-lucide="dollar-sign"></i>
          <span>Monetization</span>
          <strong>${idea.monetizationPotential}</strong>
        </div>
        <div class="rank-metric">
          <i data-lucide="trending-up"></i>
          <span>Est. AdSense</span>
          <strong style="color:var(--color-emerald)">${revLabel}</strong>
        </div>
      </div>

      <div class="scout-card-meta">
        <div class="scout-meta-row opportunity">
          <i data-lucide="lightbulb"></i>
          <span>${escapeHtml(idea.opportunity)}</span>
        </div>
        ${idea.postUrl ? `
        <div class="scout-meta-row source-link">
          <i data-lucide="external-link"></i>
          <a href="${idea.postUrl}" target="_blank" rel="noopener noreferrer">View source post →</a>
        </div>` : ""}
      </div>

      ${tagsHtml ? `<div class="scout-tags-row">${tagsHtml}</div>` : ""}

      <div class="scout-card-actions">
        <button class="btn-scout-validate">
          <i data-lucide="sliders"></i>
          Validate Lead
        </button>
        <button class="btn-scout-domain-toggle">
          <i data-lucide="globe"></i>
          Find Domain
        </button>
        <button class="btn-scout-dismiss">
          <i data-lucide="x"></i>
        </button>
      </div>

      <!-- Inline Domain Finder Panel -->
      <div class="domain-finder-panel hidden" id="domain-panel-${idea.id}">
        <div class="domain-panel-header">
          <i data-lucide="search"></i>
          <span>Domain Suggestions</span>
          <span class="domain-checking-indicator" id="domain-checking-${idea.id}">Checking availability...</span>
        </div>
        <div class="domain-list" id="domain-list-${idea.id}">
          ${generateDomainSuggestions(idea.title).map(d => `
            <div class="domain-item loading" id="ditem-${idea.id}-${d.replace(/\./g,"_")}">
              <span class="domain-name">${escapeHtml(d)}</span>
              <span class="domain-status"><span class="domain-spinner"></span></span>
              <a class="domain-register hidden" href="https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}" target="_blank" rel="noopener">Register →</a>
            </div>
          `).join("")}
        </div>
        <div class="domain-panel-footer">
          <i data-lucide="info"></i>
          Checked via RDAP (official domain registry) · Results are real-time
        </div>
      </div>
    `;

    card.querySelector(".btn-scout-validate").addEventListener("click",       () => sendToValidator(idea));
    card.querySelector(".btn-scout-domain-toggle").addEventListener("click",  () => toggleDomainPanel(idea));
    card.querySelector(".btn-scout-dismiss").addEventListener("click",        () => dismissCard(idea.id, card));

    resultsGrid.appendChild(card);
  }

  // ─── Domain Panel Logic ───────────────────────────────────────────────────────
  async function toggleDomainPanel(idea) {
    const panel = document.getElementById(`domain-panel-${idea.id}`);
    if (!panel) return;

    const isOpen = !panel.classList.contains("hidden");
    if (isOpen) {
      panel.classList.add("hidden");
      return;
    }

    panel.classList.remove("hidden");
    lucide.createIcons();

    // Only check if not already checked (items still have 'loading' class)
    const loadingItems = panel.querySelectorAll(".domain-item.loading");
    if (loadingItems.length === 0) return; // already checked

    const suggestions   = generateDomainSuggestions(idea.title);
    const checkingEl    = document.getElementById(`domain-checking-${idea.id}`);

    // Check all domains in parallel (with small stagger to avoid hammering the server)
    const checks = suggestions.map((domain, i) => sleep(i * 200).then(() => checkDomainAvailability(domain)));
    const results = await Promise.allSettled(checks);

    if (checkingEl) checkingEl.style.display = "none";

    results.forEach((result, i) => {
      const domain  = suggestions[i];
      const itemId  = `ditem-${idea.id}-${domain.replace(/\./g,"_")}`;
      const itemEl  = document.getElementById(itemId);
      if (!itemEl) return;

      itemEl.classList.remove("loading");

      if (result.status === "fulfilled") {
        const data = result.value;
        if (data.available === true) {
          itemEl.classList.add("available");
          itemEl.querySelector(".domain-status").innerHTML = `<span class="avail-badge">✓ Available</span>`;
          itemEl.querySelector(".domain-register")?.classList.remove("hidden");
        } else if (data.available === false) {
          itemEl.classList.add("taken");
          itemEl.querySelector(".domain-status").innerHTML = `<span class="taken-badge">✗ Taken</span>`;
        } else {
          itemEl.classList.add("unknown");
          itemEl.querySelector(".domain-status").innerHTML = `<span class="unknown-badge">? Unknown</span>`;
        }
      } else {
        itemEl.classList.add("unknown");
        itemEl.querySelector(".domain-status").innerHTML = `<span class="unknown-badge">? Error</span>`;
      }
    });
  }

  function dismissCard(id, cardEl) {
    scoutState.dismissed.add(id);
    cardEl.style.transition = "all 0.3s ease-out";
    cardEl.style.opacity    = "0";
    cardEl.style.transform  = "scale(0.95) translateY(-4px)";
    setTimeout(() => {
      cardEl.remove();
      document.querySelectorAll(".scout-card").forEach((c, i) => {
        const badge = c.querySelector(".scout-rank-badge");
        if (badge) badge.textContent = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`;
      });
    }, 300);
  }

  function showErrorCard(message) {
    const el = document.createElement("div");
    el.className = "scout-error-card";
    const isTimeout = /timeout|504|502|503|timed out/i.test(message);
    const isAuth = /401|invalid.*key|unauthorized/i.test(message);
    let advice = "Check your API key or try a different model.";
    if (isTimeout) {
      advice = `<strong>Timeout Fix:</strong> Switch to a faster model (Llama 3.1 8B ⚡ or Mistral 7B ⚡) in the dropdown above. The 70B models are slower and often timeout through CORS proxies.`;
    } else if (isAuth) {
      advice = `Your NVIDIA NIM API key appears to be invalid. Get a free key from <a href="https://build.nvidia.com" target="_blank" rel="noopener">build.nvidia.com</a>.`;
    }
    el.innerHTML = `
      <i data-lucide="alert-triangle"></i>
      <p><strong>Scan failed:</strong> ${escapeHtml(message)}<br>
      <span style="margin-top:.25rem;display:block">${advice}</span></p>
    `;
    resultsGrid.appendChild(el);
    lucide.createIcons();
  }

  // ─── Send to Validator ────────────────────────────────────────────────────────
  function sendToValidator(idea) {
    document.querySelector(".nav-btn[data-tab='validate']")?.click();
    setTimeout(() => {
      const kw   = document.getElementById("val-keyword");
      const vol  = document.getElementById("val-volume");
      const kd   = document.getElementById("val-kd");
      const gaps = document.querySelectorAll(".val-gap");
      if (kw)     kw.value   = idea.title;
      if (vol)    vol.value  = estimateVolume(idea);
      if (kd)     kd.value   = estimateKD(idea);
      if (gaps[0]) gaps[0].value = idea.problem;
      if (gaps[1]) gaps[1].value = idea.opportunity;
      if (gaps[2]) gaps[2].value = "";
      document.getElementById("validator-form")?.dispatchEvent(new Event("submit"));
      setTimeout(() => {
        document.getElementById("scoring-dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }, 300);
  }

  function estimateVolume(idea) {
    const base = { "Large": 45000, "Medium": 18000, "Niche": 8000 };
    return Math.round((base[idea.estimatedUsers] || 15000) * (idea.painScore / 7));
  }

  function estimateKD(idea) {
    const base = { "Large": 28, "Medium": 18, "Niche": 10 };
    return Math.min(50, Math.round((base[idea.estimatedUsers] || 18) + (idea.painScore - 5)));
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!scoutState.results.length) { showToast("No results to export.", "error"); return; }
    const ranked  = rankResults(scoutState.results);
    const headers = ["Rank","Title","Opportunity Score","Pain Score","Dev Days",
      "Competition","Monetization","Audience","Est Revenue","Problem","Opportunity",
      "Source","Post URL","Tags","Scanned At"];
    const rows = ranked.map((idea, i) => {
      const rev = estimateRevenue(idea);
      return [
        i+1,
        `"${(idea.title||"").replace(/"/g,'""')}"`,
        idea.opportunityScore, idea.painScore, idea.devDays,
        idea.competitionLevel, idea.monetizationPotential, idea.estimatedUsers,
        `$${rev.lo}-$${rev.hi}/mo`,
        `"${(idea.problem||"").replace(/"/g,'""')}"`,
        `"${(idea.opportunity||"").replace(/"/g,'""')}"`,
        idea.source, idea.postUrl||"",
        `"${(idea.tags||[]).join(", ")}"`,
        idea.scannedAt||""
      ].join(",");
    });
    const csv  = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `microfinder-scout-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${ranked.length} ideas to CSV`, "success");
  }

  // ─── Progress Helpers ─────────────────────────────────────────────────────────
  function showProgress(visible, label) {
    if (visible) {
      scoutProgress.classList.remove("hidden");
      progressLog.innerHTML = "";
      if (label) updateProgressLabel(label);
    } else { scoutProgress.classList.add("hidden"); }
  }
  function updateProgressLabel(text) { if (progressLabel) progressLabel.textContent = text; }
  function logProgress(text) {
    const ts   = new Date().toTimeString().split(" ")[0];
    const line = document.createElement("div");
    line.className = "log-line";
    line.innerHTML = `<span class="log-time">[${ts}]</span><span class="log-text">${escapeHtml(text)}</span>`;
    progressLog.appendChild(line);
    progressLog.scrollTop = progressLog.scrollHeight;
  }

  // ─── CORS Proxy Fallback (Multi-proxy with timeout) ─────────────────────────
  const CORS_PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    }
  }

  async function fetchWithCorsProxy(url, options = {}, timeoutMs = 60000) {
    // 1. Try direct fetch first
    try {
      const resp = await fetchWithTimeout(url, options, timeoutMs);
      if (resp.ok || (resp.status !== 0 && resp.status < 500)) return resp;
    } catch (_) {}

    // 2. Try each CORS proxy in order
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxyUrl = CORS_PROXIES[i](url);
      try {
        logProgress(`  ↳ Trying proxy ${i + 1}/${CORS_PROXIES.length}...`);
        const resp = await fetchWithTimeout(proxyUrl, options, timeoutMs);
        if (resp.ok || (resp.status !== 0 && resp.status < 500)) return resp;
      } catch (e) {
        console.warn(`[Scout] Proxy ${i + 1} failed:`, e.message);
        if (i === CORS_PROXIES.length - 1) throw e; // last proxy, rethrow
      }
    }
    throw new Error("All CORS proxies failed");
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────
  function clamp(val, min, max) { return Math.min(max, Math.max(min, Number(val) || min)); }
  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function shakeElement(el) {
    el.style.animation = "none"; el.offsetHeight;
    el.style.animation = "shake 0.4s ease-out";
    el.addEventListener("animationend", () => { el.style.animation = ""; }, { once: true });
  }
  function showToast(message, type = "info") {
    document.getElementById("scout-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "scout-toast";
    const bg = type === "error" ? "rgba(244,63,94,0.92)" : type === "success" ? "rgba(16,185,129,0.92)" : "rgba(99,102,241,0.92)";
    toast.style.cssText = `position:fixed;bottom:2rem;right:2rem;z-index:9999;background:${bg};
      backdrop-filter:blur(12px);color:#fff;padding:.875rem 1.5rem;border-radius:12px;
      font-family:'Outfit',sans-serif;font-size:.9rem;font-weight:600;
      box-shadow:0 8px 30px rgba(0,0,0,.4);animation:toastIn .3s ease-out;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = "toastOut .3s ease-in forwards";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  if (!document.getElementById("scout-keyframes")) {
    const s = document.createElement("style"); s.id = "scout-keyframes";
    s.textContent = `
      @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
      @keyframes toastIn  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes toastOut { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(10px)} }
      @keyframes domainPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    `;
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

})();
