export default async function handler(req, res) {
  // Add CORS headers for local development
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  // Vercel Edge Caching:
  // s-maxage=900: Cache at edge for 15 minutes
  // stale-while-revalidate=600: Serve stale content for another 10 min while refreshing in background
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=600')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

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

  try {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error(`LeetCode API returned ${response.status}`);
    }

    const result = await response.json();

    if (result.data && result.data.matchedUser) {
      const data = result.data;
      const user = data.matchedUser;
      const acStats = user.submitStatsGlobal.acSubmissionNum;
      const allQuestions = data.allQuestionsCount;

      const getStat = (arr, diff) => {
        const entry = arr.find((s) => s.difficulty === diff);
        return entry ? entry.count : 0;
      };

      return res.status(200).json({
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
        acceptanceRate: null,
        timestamp: Date.now()
      });
    }

    if (result.data && result.data.matchedUser === null) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(500).json({ error: "Failed to fetch from LeetCode" });
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
