document.addEventListener("DOMContentLoaded", () => {
  // --- UI Elements ---
  const tabBtns = document.querySelectorAll(".nav-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  // Browse Tab Elements
  const keywordsGrid = document.getElementById("keywords-grid");
  const searchInput = document.getElementById("search-input");
  const categoryFilter = document.getElementById("filter-category");
  const kdRange = document.getElementById("range-kd");
  const kdVal = document.getElementById("kd-val");
  const volRange = document.getElementById("range-vol");
  const volVal = document.getElementById("vol-val");

  // Stats Elements
  const statTotal = document.getElementById("stat-total");
  const statAvgVol = document.getElementById("stat-avg-vol");
  const statLowKd = document.getElementById("stat-low-kd");

  // Detail Sidebar Elements
  const sidebar = document.getElementById("details-sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const closeSidebarBtn = document.getElementById("btn-close-sidebar");

  // Validator Tab Elements
  const validatorForm = document.getElementById("validator-form");
  const scoringDashboard = document.getElementById("scoring-dashboard");
  const scoreNum = document.getElementById("score-num");
  const scoreCircle = document.getElementById("score-circle");
  const verdictBadge = document.getElementById("verdict-badge");
  const verdictSummary = document.getElementById("verdict-summary");
  const scoreChecklist = document.getElementById("score-checklist");
  const valResultSection = document.getElementById("validator-result-section");
  const valPromptCode = document.getElementById("val-prompt-code");
  const copyValPromptBtn = document.getElementById("btn-copy-val-prompt");

  // Checklist Tab Elements
  const checklistCheckboxes = document.querySelectorAll(".tracker-list input[type='checkbox']");
  const resetChecklistBtn = document.getElementById("btn-reset-checklist");

  // --- Initialize State ---
  let appState = {
    activeTab: "browse",
    filters: {
      search: "",
      category: "all",
      maxKd: 50,
      minVol: 5000
    }
  };

  // --- Initializer functions ---
  function init() {
    setupTabSwitching();
    setupFilters();
    setupDetailsSidebar();
    setupValidator();
    setupChecklistTracker();
    renderKeywords();
    
    // Initialize Lucide icons on page load
    lucide.createIcons();
  }

  // --- Tab Navigation ---
  function setupTabSwitching() {
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        
        tabBtns.forEach(b => b.classList.remove("active"));
        tabPanes.forEach(pane => pane.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(`tab-${targetTab}`).classList.add("active");
        appState.activeTab = targetTab;

        // Close sidebar if tab switches
        closeSidebar();
      });
    });
  }

  // --- Filters Handlers ---
  function setupFilters() {
    searchInput.addEventListener("input", (e) => {
      appState.filters.search = e.target.value.toLowerCase();
      renderKeywords();
    });

    categoryFilter.addEventListener("change", (e) => {
      appState.filters.category = e.target.value;
      renderKeywords();
    });

    kdRange.addEventListener("input", (e) => {
      const val = e.target.value;
      kdVal.textContent = val;
      appState.filters.maxKd = parseInt(val, 10);
      renderKeywords();
    });

    volRange.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      volVal.textContent = formatNumber(val);
      appState.filters.minVol = val;
      renderKeywords();
    });
  }

  // --- Calculation & Score Algorithms ---
  function calculateFeasibility(keywordData) {
    const { volume, kd, gaps } = keywordData;
    
    // Volume Factor (Max 40 points): optimal is >= 10,000 US monthly search
    // Linear scale from 0 to 10k accounts for 30 points, above 10k scaling to 50k gives remaining 10 points
    let volScore = 0;
    if (volume >= 10000) {
      volScore = 30 + Math.min(((volume - 10000) / 40000) * 10, 10);
    } else {
      volScore = (volume / 10000) * 30;
    }

    // Difficulty Factor (Max 40 points): lower KD is better.
    // 0 difficulty = 40 pts, 30 difficulty = 20 pts, 50+ difficulty = 0 pts.
    let kdScore = 0;
    if (kd <= 15) {
      kdScore = 40;
    } else if (kd <= 35) {
      kdScore = 40 - ((kd - 15) / 20) * 25; // drop to 15 pts at kd 35
    } else {
      kdScore = Math.max(15 - ((kd - 35) / 25) * 15, 0); // linear drop to 0 at kd 60
    }

    // Gaps Factor (Max 20 points): number of identified competitor gaps
    // 1 gap = 5 points, 2 gaps = 15 points, 3+ gaps = 20 points
    let gapScore = 0;
    const nonEmptys = gaps.filter(g => g && g.trim() !== "");
    if (nonEmptys.length === 1) gapScore = 5;
    else if (nonEmptys.length === 2) gapScore = 15;
    else if (nonEmptys.length >= 3) gapScore = 20;

    const total = Math.round(volScore + kdScore + gapScore);
    return Math.min(Math.max(total, 0), 100);
  }

  function getScoreCategory(score) {
    if (score >= 75) return "high";
    if (score >= 50) return "medium";
    return "low";
  }

  // --- Render Keyword Cards ---
  function renderKeywords() {
    // Clear grid
    keywordsGrid.innerHTML = "";

    const filtered = KEYWORDS_DATABASE.filter(item => {
      const matchSearch = item.keyword.toLowerCase().includes(appState.filters.search) ||
                          item.category.toLowerCase().includes(appState.filters.search) ||
                          item.description.toLowerCase().includes(appState.filters.search);
      const matchCategory = appState.filters.category === "all" || item.category === appState.filters.category;
      const matchKd = item.kd <= appState.filters.maxKd;
      const matchVol = item.volume >= appState.filters.minVol;

      return matchSearch && matchCategory && matchKd && matchVol;
    });

    // Update statistics badges based on current database
    updateStats(filtered);

    if (filtered.length === 0) {
      keywordsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color)">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;"></i>
          <h4 style="font-size: 1.15rem; margin-bottom: 0.25rem;">No Keywords Found</h4>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">Try adjusting your search criteria or max difficulty slider.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    filtered.forEach(item => {
      const score = calculateFeasibility(item);
      const scoreCat = getScoreCategory(score);
      
      const card = document.createElement("div");
      card.className = "keyword-card";
      card.innerHTML = `
        <div class="card-header-row">
          <span class="category-tag">${item.category}</span>
          <span class="score-badge ${scoreCat}">${score} Score</span>
        </div>
        <h3>${item.keyword}</h3>
        <p class="card-desc">${item.description}</p>
        <div class="card-metrics">
          <div class="metric">
            <span class="metric-label">US Vol</span>
            <span class="metric-val">${formatNumber(item.volume)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Diff (KD)</span>
            <span class="metric-val">${item.kd}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => openSidebar(item));
      keywordsGrid.appendChild(card);
    });

    lucide.createIcons();
  }

  function updateStats(items) {
    statTotal.textContent = items.length;
    
    const totalVol = items.reduce((sum, item) => sum + item.volume, 0);
    const avgVol = items.length > 0 ? Math.round(totalVol / items.length) : 0;
    statAvgVol.textContent = formatNumber(avgVol);

    const easyItems = items.filter(item => item.kd <= 20);
    statLowKd.textContent = easyItems.length;
  }

  // --- Detail Sidebar Handlers ---
  function setupDetailsSidebar() {
    closeSidebarBtn.addEventListener("click", closeSidebar);
    
    // Close sidebar on pressing Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) {
        closeSidebar();
      }
    });
  }

  function openSidebar(item) {
    const score = calculateFeasibility(item);
    const scoreCat = getScoreCategory(score);
    
    let gapsHtml = item.gaps.map(gap => `<li><i data-lucide="alert-triangle"></i><span>${gap}</span></li>`).join("");
    let competitorsHtml = item.competitors.map(comp => `
      <li>
        <i data-lucide="external-link"></i>
        <a href="${comp.url}" target="_blank" rel="noopener noreferrer">${comp.name}</a>
      </li>
    `).join("");
    let paaHtml = item.paa.map(q => `<li><i data-lucide="help-circle"></i><span>${q}</span></li>`).join("");

    sidebarContent.innerHTML = `
      <span class="category-tag sidebar-category">${item.category}</span>
      <h3 class="sidebar-title">${item.keyword}</h3>
      <p class="sidebar-desc">${item.description}</p>

      <div class="sidebar-section">
        <div class="sidebar-metrics-row">
          <div class="sidebar-metric-card">
            <span class="lbl">US Volume</span>
            <span class="val">${formatNumber(item.volume)}</span>
          </div>
          <div class="sidebar-metric-card">
            <span class="lbl">Difficulty (KD)</span>
            <span class="val">${item.kd}</span>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <h4>Competitor Gaps to Beat</h4>
        <ul class="sidebar-list text-rose-glow">${gapsHtml}</ul>
      </div>

      <div class="sidebar-section">
        <h4>Direct Competitors</h4>
        <ul class="sidebar-list competitors-list">${competitorsHtml}</ul>
      </div>

      <div class="sidebar-section">
        <h4>FAQ Ideas (PAA Questions)</h4>
        <ul class="sidebar-list text-indigo">${paaHtml}</ul>
      </div>

      <div class="sidebar-action-box">
        <h4>Ready to build?</h4>
        <p>You can generate a comprehensive project build brief prompt template matching this opportunity.</p>
        <button class="btn-sidebar-build" id="btn-sidebar-build">
          <i data-lucide="sparkles"></i>
          <span>Send to Brief Builder</span>
        </button>
      </div>
    `;

    sidebar.classList.add("open");
    lucide.createIcons();

    // Attach Event Listener to "Send to Brief Builder" button inside sidebar
    document.getElementById("btn-sidebar-build").addEventListener("click", () => {
      closeSidebar();
      // Switch tab
      document.querySelector(".nav-btn[data-tab='validate']").click();
      // Populate fields
      document.getElementById("val-keyword").value = item.keyword;
      document.getElementById("val-category").value = item.category;
      document.getElementById("val-volume").value = item.volume;
      document.getElementById("val-kd").value = item.kd;
      
      const gapInputs = document.querySelectorAll(".val-gap");
      gapInputs.forEach((input, index) => {
        input.value = item.gaps[index] || "";
      });

      // Submit form programmatically to show score and prompt brief
      validatorForm.dispatchEvent(new Event("submit"));
    });
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
  }

  // --- Lead Validator Handlers ---
  function setupValidator() {
    validatorForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const keyword = document.getElementById("val-keyword").value.trim();
      const category = document.getElementById("val-category").value;
      const volume = parseInt(document.getElementById("val-volume").value, 10);
      const kd = parseInt(document.getElementById("val-kd").value, 10);
      
      const gapInputs = document.querySelectorAll(".val-gap");
      const gaps = Array.from(gapInputs).map(input => input.value.trim()).filter(val => val !== "");

      // Run Feasibility score
      const keywordData = { keyword, category, volume, kd, gaps };
      const score = calculateFeasibility(keywordData);

      // Render Score Animation
      animateRadialScore(score);

      // Render score checklists
      updateValidatorChecklist(keywordData);

      // Generate brief prompt code block
      generatePromptBrief(keywordData);

      // Scroll down slightly to show results
      scoringDashboard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    copyValPromptBtn.addEventListener("click", () => {
      const promptCode = valPromptCode.textContent;
      navigator.clipboard.writeText(promptCode).then(() => {
        // Simple microinteraction feedback
        const btnText = copyValPromptBtn.querySelector("span");
        const origText = btnText.textContent;
        const icon = copyValPromptBtn.querySelector("i");
        
        btnText.textContent = "Copied Brief!";
        copyValPromptBtn.style.background = "var(--color-emerald-glow)";
        copyValPromptBtn.style.borderColor = "var(--color-emerald)";
        icon.setAttribute("data-lucide", "check");
        lucide.createIcons();

        setTimeout(() => {
          btnText.textContent = origText;
          copyValPromptBtn.style.background = "";
          copyValPromptBtn.style.borderColor = "";
          icon.setAttribute("data-lucide", "copy");
          lucide.createIcons();
        }, 2000);
      });
    });
  }

  function animateRadialScore(score) {
    scoreNum.textContent = score;
    
    // Stroke-dasharray of our radial circle is 283 (approx 2 * PI * r = 2 * 3.1415 * 45 = 282.7)
    const offset = 283 - (283 * score) / 100;
    scoreCircle.style.strokeDashoffset = offset;

    // Colors & Verdict styling
    verdictBadge.className = "verdict-badge";
    if (score >= 75) {
      scoreCircle.style.stroke = "var(--color-emerald)";
      verdictBadge.classList.add("go");
      verdictBadge.textContent = "GO (EXCELLENT)";
      verdictSummary.textContent = "This keyword is highly viable. Excellent search volume, low competition, and strong opportunity for design gaps.";
    } else if (score >= 50) {
      scoreCircle.style.stroke = "var(--color-amber)";
      verdictBadge.classList.add("warning");
      verdictBadge.textContent = "PROCEED WITH CAUTION";
      verdictSummary.textContent = "Moderate opportunity. You can win, but make sure your product has significant features to break through competitor authority.";
    } else {
      scoreCircle.style.stroke = "var(--color-rose)";
      verdictBadge.classList.add("nogo");
      verdictBadge.textContent = "NO-GO (SKIP)";
      verdictSummary.textContent = "Poor alignment with playbook metrics. Recommend evaluating another keyword with lower difficulty or more direct competitor flaws.";
    }
  }

  function updateValidatorChecklist(data) {
    const checkListItems = scoreChecklist.children;
    
    // 1. Volume Check >= 10k
    if (data.volume >= 10000) {
      setChecklistItemState(checkListItems[0], "passed", `US search volume is strong (${formatNumber(data.volume)} / mo)`);
    } else {
      setChecklistItemState(checkListItems[0], "failed", `Low volume warning (${formatNumber(data.volume)} / mo is under 10k)`);
    }

    // 2. KD Check <= 30
    if (data.kd <= 30) {
      setChecklistItemState(checkListItems[1], "passed", `Keyword difficulty is low & easy to rank (KD: ${data.kd})`);
    } else if (data.kd <= 45) {
      setChecklistItemState(checkListItems[1], "warning", `Keyword difficulty is moderate (KD: ${data.kd})`);
    } else {
      setChecklistItemState(checkListItems[1], "failed", `KD is too high (${data.kd}), dominated by authoritative sites`);
    }

    // 3. Gaps listed check
    if (data.gaps.length >= 2) {
      setChecklistItemState(checkListItems[2], "passed", `${data.gaps.length} competitor design gaps identified`);
    } else if (data.gaps.length === 1) {
      setChecklistItemState(checkListItems[2], "warning", `Only 1 competitor gap noted; aim for 2+ distinct improvements`);
    } else {
      setChecklistItemState(checkListItems[2], "failed", `Zero competitor gaps documented; build needs differentiation`);
    }

    // 4. Single-purpose tool check (by Category selection)
    setChecklistItemState(checkListItems[3], "passed", `Matches ${data.category} single-purpose utility category`);

    lucide.createIcons();
  }

  function setChecklistItemState(liElement, state, message) {
    liElement.className = state;
    const icon = liElement.querySelector("i");
    const span = liElement.querySelector("span");
    span.textContent = message;

    if (state === "passed") {
      icon.setAttribute("data-lucide", "check-circle-2");
    } else if (state === "warning") {
      icon.setAttribute("data-lucide", "alert-circle");
      icon.style.color = "var(--color-amber)";
    } else {
      icon.setAttribute("data-lucide", "x-circle");
    }
  }

  function generatePromptBrief(data) {
    const gapsBulletPoints = data.gaps.map(g => `- ${g}`).join("\n");
    const prompt = `We're building ${data.keyword}, a single-purpose web tool that is categorised under ${data.category} tools.

Target keyword: ${data.keyword}
Known competitor gaps to beat:
${gapsBulletPoints || "- (Identify specific design/technical improvements during review)"}

For this pass, focus only on:
- Designing the responsive visual mockup of the utility screen
- Implementing clean semantic HTML layouts
- Ensuring near-zero JS payloads outside of direct calculation logic

Use the design reference at docs/design-guidelines.md and Tailwind CSS.
Keep the page structure clean for SEO — single clear H1, semantic HTML,
no unnecessary client-side JS beyond what the tool itself needs.`;

    valPromptCode.textContent = prompt;
    valResultSection.classList.remove("hidden");
  }

  // --- Checklist Tab Persistent Storage ---
  function setupChecklistTracker() {
    // Load checklist states from local storage
    const savedChecklist = JSON.parse(localStorage.getItem("microtool_checklist")) || {};

    checklistCheckboxes.forEach(chk => {
      const id = chk.id;
      if (savedChecklist[id]) {
        chk.checked = true;
      }

      chk.addEventListener("change", () => {
        const currentSaved = JSON.parse(localStorage.getItem("microtool_checklist")) || {};
        currentSaved[chk.id] = chk.checked;
        localStorage.setItem("microtool_checklist", JSON.stringify(currentSaved));
      });
    });

    // Reset Checklist Button Handler
    resetChecklistBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to reset the launch checklist progress?")) {
        checklistCheckboxes.forEach(chk => chk.checked = false);
        localStorage.removeItem("microtool_checklist");
      }
    });
  }

  // --- Utility functions ---
  function formatNumber(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(0) + "k";
    }
    return num.toString();
  }

  // Run the initializer
  init();
});
