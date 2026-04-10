document.addEventListener("DOMContentLoaded", function () {
  // ============================================
  // DOM Elements
  // ============================================
  const searchButton = document.getElementById("search-btn");
  const usernameInput = document.getElementById("user-input");
  const statsContainer = document.getElementById("stats-container");
  const statusMessage = document.getElementById("status-message");
  const searchHint = document.getElementById("search-hint");
  const lastUpdated = document.getElementById("last-updated");

  // Total summary
  const totalRingFill = document.getElementById("total-ring-fill");
  const totalSolvedNum = document.getElementById("total-solved-num");
  const totalSubtitle = document.getElementById("total-subtitle");
  const usernameDisplay = document.getElementById("username-display");
  const acceptanceText = document.getElementById("acceptance-text");

  // Difficulty bars
  const easyBar = document.getElementById("easy-bar");
  const mediumBar = document.getElementById("medium-bar");
  const hardBar = document.getElementById("hard-bar");
  const easyCount = document.getElementById("easy-count");
  const mediumCount = document.getElementById("medium-count");
  const hardCount = document.getElementById("hard-count");
  const easyPercent = document.getElementById("easy-percent");
  const mediumPercent = document.getElementById("medium-percent");
  const hardPercent = document.getElementById("hard-percent");

  // Stats cards
  const statsCards = document.getElementById("stats-cards");

  // ============================================
  // API Strategy:
  // 1. Primary: LeetCode GraphQL directly (via multiple CORS proxies)
  // 2. Fallback: alfa-leetcode-api on Render
  //
  // The old leetcode-stats-api.herokuapp.com is dead.
  // LeetCode's own GraphQL blocks CORS from browsers, so
  // we use public CORS proxies as intermediaries.
  // ============================================

  const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";
  const ALFA_API_BASE = "https://alfa-leetcode-api.onrender.com";
  const VERCEL_API = "/api/stats";

  // Multiple CORS proxies for redundancy
  const CORS_PROXIES = [
    "https://corsproxy.io/?url=",
    "https://api.allorigins.win/raw?url=",
  ];

  // Caching configuration
  const CACHE_KEY_PREFIX = "leetmetric_cache_";
  const CACHE_EXPIRY = 15 * 60 * 1000; // 15 minutes

  // ============================================
  // Validation
  // ============================================
  function validateUsername(username) {
    if (username.trim() === "") {
      showStatus("Please enter a username", "error");
      return false;
    }
    const regex = /^[a-zA-Z0-9_-]{1,30}$/;
    if (!regex.test(username.trim())) {
      showStatus("Invalid username format", "error");
      return false;
    }
    return true;
  }

  // ============================================
  // Status Messages
  // ============================================
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
  }

  function hideStatus() {
    statusMessage.className = "status-message";
  }

  // ============================================
  // Loading State
  // ============================================
  function setLoading(loading) {
    if (loading) {
      searchButton.classList.add("loading");
      searchButton.disabled = true;
      searchHint.textContent = "Fetching data — this may take a moment...";
    } else {
      searchButton.classList.remove("loading");
      searchButton.disabled = false;
      searchHint.textContent = "Press Enter or click Search to look up stats";
    }
  }

  // ============================================
  // Caching Helpers
  // ============================================
  function getFromCache(username) {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${username.toLowerCase()}`);
    if (!cached) return null;

    try {
      const { data, timestamp } = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > CACHE_EXPIRY;
      return { data, timestamp, isExpired };
    } catch (e) {
      return null;
    }
  }

  function saveToCache(username, data) {
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(
      `${CACHE_KEY_PREFIX}${username.toLowerCase()}`,
      JSON.stringify(cacheData)
    );
  }

  // ============================================
  // Method 1: Vercel API (High speed, server-side)
  // ============================================
  async function fetchViaVercelAPI(username) {
    try {
      const response = await fetch(`${VERCEL_API}?username=${username}`);
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 404) {
        return { error: "not_found" };
      }
    } catch (e) {
      console.warn("Vercel API failed (expected if running locally without vercel dev):", e.message);
    }
    return null;
  }

  // ============================================
  // Method 2: LeetCode GraphQL via CORS proxy (Legacy Fallback)
  // ============================================
  async function fetchViaGraphQL(username) {
    const query = {
      query: `
        query getUserProfile($username: String!) {
          matchedUser(username: $username) {
            username
            profile {
              ranking
              reputation
              starRating
            }
            submitStatsGlobal {
              acSubmissionNum {
                difficulty
                count
              }
            }
          }
          allQuestionsCount {
            difficulty
            count
          }
        }
      `,
      variables: { username: username },
    };

    // Try each CORS proxy
    for (const proxy of CORS_PROXIES) {
      try {
        const targetUrl = encodeURIComponent(LEETCODE_GRAPHQL);
        const response = await fetch(proxy + targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(query),
        });

        if (!response.ok) continue;

        const result = await response.json();

        if (result.data && result.data.matchedUser) {
          return normalizeGraphQLData(result.data);
        }

        // User not found
        if (result.data && result.data.matchedUser === null) {
          return { error: "not_found" };
        }
      } catch (e) {
        console.warn(`CORS proxy ${proxy} failed:`, e.message);
        continue;
      }
    }

    return null; // All proxies failed
  }

  function normalizeGraphQLData(data) {
    const user = data.matchedUser;
    const acStats = user.submitStatsGlobal.acSubmissionNum;
    const allQuestions = data.allQuestionsCount;

    const getStat = (arr, diff) => {
      const entry = arr.find((s) => s.difficulty === diff);
      return entry ? entry.count : 0;
    };

    return {
      username: user.username,
      totalSolved: getStat(acStats, "All"),
      easySolved: getStat(acStats, "Easy"),
      mediumSolved: getStat(acStats, "Medium"),
      hardSolved: getStat(acStats, "Hard"),
      totalQuestions: getStat(allQuestions, "All"),
      totalEasy: getStat(allQuestions, "Easy"),
      totalMedium: getStat(allQuestions, "Medium"),
      totalHard: getStat(allQuestions, "Hard"),
      ranking: user.profile.ranking || "N/A",
      reputation: user.profile.reputation || 0,
      acceptanceRate: null, // GraphQL doesn't return this directly in this query
    };
  }

  // ============================================
  // Method 2: alfa-leetcode-api fallback
  // ============================================
  async function fetchViaAlfaAPI(username) {
    try {
      const [profileRes, solvedRes] = await Promise.all([
        fetch(`${ALFA_API_BASE}/${username}`),
        fetch(`${ALFA_API_BASE}/${username}/solved`),
      ]);

      if (profileRes.status === 429 || solvedRes.status === 429) {
        return { error: "rate_limited" };
      }

      if (!profileRes.ok || !solvedRes.ok) {
        return null;
      }

      const profileData = await profileRes.json();
      const solvedData = await solvedRes.json();

      if (!solvedData || solvedData.errors) {
        return { error: "not_found" };
      }

      return {
        username: username,
        totalSolved: solvedData.solvedProblem || 0,
        easySolved: solvedData.easySolved || 0,
        mediumSolved: solvedData.mediumSolved || 0,
        hardSolved: solvedData.hardSolved || 0,
        totalQuestions: profileData.totalQuestions || 3450,
        totalEasy: profileData.totalEasy || 850,
        totalMedium: profileData.totalMedium || 1800,
        totalHard: profileData.totalHard || 800,
        ranking: profileData.ranking || "N/A",
        reputation: profileData.reputation || 0,
        acceptanceRate: profileData.acceptanceRate
          ? parseFloat(profileData.acceptanceRate).toFixed(1)
          : calculateAcceptanceFromSolved(solvedData),
      };
    } catch (e) {
      console.warn("alfa-leetcode-api failed:", e.message);
      return null;
    }
  }

  function calculateAcceptanceFromSolved(solved) {
    if (solved.totalSubmissionNum && Array.isArray(solved.totalSubmissionNum)) {
      const allEntry = solved.totalSubmissionNum.find(
        (s) => s.difficulty === "All"
      );
      const acEntry =
        solved.acSubmissionNum &&
        solved.acSubmissionNum.find((s) => s.difficulty === "All");
      if (allEntry && acEntry && allEntry.submissions > 0) {
        return ((acEntry.submissions / allEntry.submissions) * 100).toFixed(1);
      }
    }
    return null;
  }

  // ============================================
  // Main Fetch Function (tries all methods)
  // ============================================
  async function fetchUserDetails(username) {
    setLoading(true);
    hideStatus();
    statsContainer.classList.remove("visible");

    // 0. Check Cache First
    const cached = getFromCache(username);
    if (cached && !cached.isExpired) {
      console.log("Serving from fresh local cache...");
      displayUserData(cached.data, cached.timestamp);
      setLoading(false);
      return;
    }

    try {
      // 1. Try Vercel API first (Best performance on production)
      let result = await fetchViaVercelAPI(username);

      // 2. Fallback: Try GraphQL via CORS proxy
      if (!result) {
        console.log("Vercel API unavailable, trying GraphQL via CORS proxy...");
        result = await fetchViaGraphQL(username);
      }

      // 3. Last Resport: Try alfa-leetcode-api
      if (!result) {
        console.log("GraphQL proxies failed, trying alfa-leetcode-api...");
        result = await fetchViaAlfaAPI(username);
      }

      // Handle errors
      if (!result) {
        // If we have expired cache, at least show that
        if (cached) {
          showStatus("APIs are down, showing recently cached data", "info");
          displayUserData(cached.data, cached.timestamp);
          return;
        }

        showStatus(
          "All API endpoints are currently unavailable. Please try again in a few minutes.",
          "error"
        );
        return;
      }

      if (result.error === "not_found") {
        showStatus(
          `User "${username}" not found on LeetCode. Please check the spelling.`,
          "error"
        );
        return;
      }

      if (result.error === "rate_limited") {
        showStatus(
          "API is rate limited — please wait a moment and try again.",
          "error"
        );
        return;
      }

      // Success! Update Cache and Display
      saveToCache(username, result);
      displayUserData(result, result.timestamp || Date.now());
    } catch (error) {
      console.error("Error fetching user details:", error);
      if (cached) {
        showStatus("Network error, showing cached data", "info");
        displayUserData(cached.data, cached.timestamp);
      } else {
        showStatus(
          "Network error — check your connection and try again.",
          "error"
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // Display Data
  // ============================================
  function displayUserData(data, timestamp) {
    const {
      username,
      totalSolved,
      easySolved,
      mediumSolved,
      hardSolved,
      totalQuestions,
      totalEasy,
      totalMedium,
      totalHard,
      ranking,
      reputation,
      acceptanceRate,
    } = data;

    // Last updated text
    if (timestamp && lastUpdated) {
      const date = new Date(timestamp);
      lastUpdated.textContent = `Last updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // --- Update Total Summary ---
    usernameDisplay.textContent = username;
    totalSubtitle.textContent = `${totalSolved} / ${totalQuestions} problems solved`;

    if (acceptanceRate) {
      acceptanceText.textContent = `${acceptanceRate}% acceptance`;
    } else {
      // Calculate from solved data
      const rate =
        totalQuestions > 0
          ? ((totalSolved / totalQuestions) * 100).toFixed(1)
          : "N/A";
      acceptanceText.textContent = `${rate}% completion`;
    }

    // Animate total count
    animateNumber(totalSolvedNum, 0, totalSolved, 800);

    // Animate SVG ring
    const circumference = 2 * Math.PI * 60; // r=60
    const offset =
      circumference - (totalSolved / totalQuestions) * circumference;
    totalRingFill.style.strokeDasharray = circumference;
    totalRingFill.getBoundingClientRect();
    requestAnimationFrame(() => {
      totalRingFill.style.strokeDashoffset = Math.max(offset, 0);
    });

    // Add gradient definition dynamically
    ensureRingGradient();

    // --- Update Difficulty Bars ---
    updateDifficulty(easyBar, easyCount, easyPercent, easySolved, totalEasy);
    updateDifficulty(
      mediumBar,
      mediumCount,
      mediumPercent,
      mediumSolved,
      totalMedium
    );
    updateDifficulty(hardBar, hardCount, hardPercent, hardSolved, totalHard);

    // --- Stats Cards ---
    const cards = [
      {
        icon: "🏆",
        label: "Ranking",
        value:
          typeof ranking === "number" ? ranking.toLocaleString() : ranking,
      },
      {
        icon: "⭐",
        label: "Reputation",
        value: reputation.toLocaleString(),
      },
      {
        icon: "🎯",
        label: "Total Solved",
        value: totalSolved.toLocaleString(),
      },
      {
        icon: "✅",
        label: "Easy Solved",
        value: easySolved.toLocaleString(),
      },
      {
        icon: "🔶",
        label: "Medium Solved",
        value: mediumSolved.toLocaleString(),
      },
      {
        icon: "🔴",
        label: "Hard Solved",
        value: hardSolved.toLocaleString(),
      },
    ];

    statsCards.innerHTML = cards
      .map(
        (card) => `
        <div class="stat-card">
          <div class="stat-card-icon">${card.icon}</div>
          <div class="stat-card-value">${card.value}</div>
          <div class="stat-card-label">${card.label}</div>
        </div>
      `
      )
      .join("");

    // Show the stats
    statsContainer.classList.add("visible");
  }

  // ============================================
  // Helpers
  // ============================================
  function updateDifficulty(bar, countEl, percentEl, solved, total) {
    const percent = total > 0 ? ((solved / total) * 100).toFixed(1) : 0;
    countEl.textContent = `${solved} / ${total}`;
    percentEl.textContent = `${percent}%`;

    requestAnimationFrame(() => {
      bar.style.width = `${percent}%`;
    });
  }

  function animateNumber(element, start, end, duration) {
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      element.textContent = current;
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  function ensureRingGradient() {
    const svg = document.querySelector(".total-ring");
    if (!svg) return;
    if (svg.querySelector("#ringGradient")) return;

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00b8a3" />
        <stop offset="50%" stop-color="#ffc01e" />
        <stop offset="100%" stop-color="#ef4743" />
      </linearGradient>
    `;
    svg.prepend(defs);
  }

  // ============================================
  // Event Listeners
  // ============================================
  searchButton.addEventListener("click", function () {
    const username = usernameInput.value.trim();
    if (validateUsername(username)) {
      fetchUserDetails(username);
    }
  });

  usernameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const username = usernameInput.value.trim();
      if (validateUsername(username)) {
        fetchUserDetails(username);
      }
    }
  });

  // Focus the input on load
  usernameInput.focus();
});