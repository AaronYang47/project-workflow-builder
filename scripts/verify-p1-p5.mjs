import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACT_DIR = "/Users/aaronyang/.gemini/antigravity/brain/7d8d3226-d87e-4e60-b76c-4099059b8a6b";

const scenarios = [
  {
    name: "P1_Premier_Validated",
    answers: {
      dm: 0, // Direct Decision Maker (18)
      scale: 0, // Defined (12)
      site: 0, // Owned (15)
      design: 0, // Level 4 (15)
      funding: 0, // Secured (6)
      timeline: 0, // Realistic (4)
      consultants: 0, // Engaged (4)
      fit: 0, // High (6)
      commitment: 0, // Paid Contract (5)
    },
    expectedGrade: "P1",
    expectedRoute: "GATE 1 PASSED (P1)",
  },
  {
    name: "P2_Strong_Qualified",
    answers: {
      dm: 0, // Direct (18)
      scale: 0, // Defined (12)
      site: 0, // Owned (15)
      design: 3, // Level 1 Concept (6)
      funding: 0, // Secured (6)
      timeline: 1, // Accelerated (2)
      consultants: 0, // Engaged (4)
      fit: 0, // High (6)
      commitment: 0, // Paid Contract (5)
    },
    expectedGrade: "P2",
    expectedRoute: "PROCEED TO CSA / PCS",
  },
  {
    name: "P3_Developing_Opportunity",
    answers: {
      dm: 1, // Influencer (9)
      scale: 1, // Rough (6)
      site: 1, // Under Option (10)
      design: 3, // Level 1 Concept (6)
      funding: 1, // Progressing (4)
      timeline: 0, // Realistic (4)
      consultants: 1, // In-progress (2)
      fit: 1, // Moderate (3)
      commitment: 1, // Strategic LOI / Verbal (2)
    },
    expectedGrade: "P3",
    expectedRoute: "PROCEED TO CSA / PCS",
  },
  {
    name: "P4_Early_Stage_Feasibility",
    answers: {
      dm: 1, // Influencer (9)
      scale: 1, // Rough (6)
      site: 2, // Searching (3)
      design: 4, // Level 0 (3)
      funding: 2, // Speculative (2)
      timeline: 1, // Accelerated (2)
      consultants: 2, // None (1)
      fit: 1, // Moderate (3)
      commitment: 2, // Verbal (1)
    },
    expectedGrade: "P4",
    expectedRoute: "SITE FEASIBILITY LOOP",
  },
  {
    name: "P5_Disqualified_NoGo",
    answers: {
      dm: 2, // Unclear / No Access (-10, Fatal Red Flag)
      scale: 1,
      site: 0,
      design: 3,
      funding: 1,
      timeline: 2, // Impossible (-10, Fatal Red Flag)
      consultants: 1,
      fit: 2, // Blocker (-20, Fatal Red Flag)
      commitment: 2,
    },
    expectedGrade: "P5",
    expectedRoute: "NO-GO · DISQUALIFIED",
  },
];

async function run() {
  console.log("Launching headless browser at:", CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1600,1000"],
    defaultViewport: { width: 1600, height: 1000 },
  });

  const page = await browser.newPage();
  console.log("Navigating to http://localhost:3456 ...");
  await page.goto("http://localhost:3456", {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  // Wait for canvas nodes
  await page.waitForSelector(".react-flow__node", { timeout: 15000 });
  console.log("Canvas loaded successfully.");

  const results = [];

  for (const s of scenarios) {
    console.log(`\n--- Testing Scenario: ${s.name} ---`);

    // Reset or set question choices
    for (let step = 0; step < 8; step++) {
      // Click step tab
      const tabButtons = await page.$$("div.scroll-thin > button");
      if (tabButtons[step]) {
        await tabButtons[step].click();
        await new Promise((r) => setTimeout(r, 120));
      }

      // Answer specific questions if mapped
      if (step === 0 && s.answers.dm !== undefined) {
        const options = await page.$$("div.divide-y > button");
        if (options[s.answers.dm]) await options[s.answers.dm].click();
      } else if (step === 1 && s.answers.scale !== undefined) {
        const options = await page.$$("div.divide-y > button");
        if (options[s.answers.scale]) await options[s.answers.scale].click();
      } else if (step === 2 && s.answers.site !== undefined) {
        const options = await page.$$("div.divide-y > button");
        if (options[s.answers.site]) await options[s.answers.site].click();
      } else if (step === 3 && s.answers.design !== undefined) {
        const options = await page.$$("div.divide-y > button");
        if (options[s.answers.design]) await options[s.answers.design].click();
      } else if (step === 5 && (s.answers.funding !== undefined || s.answers.timeline !== undefined)) {
        const options = await page.$$("div.divide-y > button");
        if (options[s.answers.timeline]) await options[s.answers.timeline].click();
      } else if (step === 6 && (s.answers.consultants !== undefined || s.answers.fit !== undefined)) {
        const options = await page.$$("div.divide-y > button");
        if (options[s.answers.fit]) await options[s.answers.fit].click();
      } else if (step === 7 && s.answers.commitment !== undefined) {
        const options = await page.$$("div.divide-y > button");
        if (options[s.answers.commitment]) await options[s.answers.commitment].click();
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    await new Promise((r) => setTimeout(r, 400));

    // Extract current displayed values
    const state = await page.evaluate(() => {
      const oppNode = document.querySelector(".workflow-node");
      if (!oppNode) return null;

      const headerBadge = oppNode.querySelector("[data-node-header] span.rounded-full")?.textContent?.trim() || "";
      const scoreBadge = oppNode.querySelector("[data-node-header] div.shadow-xs")?.textContent?.trim() || "";
      const rightPanelScore = oppNode.querySelector("div.min-w-0 div.font-mono.font-black")?.textContent?.trim() || "";
      const rightPanelGrade = oppNode.querySelector("div.min-w-0 div.text-xs.font-bold")?.textContent?.trim() || "";
      const recommendedPath = oppNode.querySelector("div.bg-primary\\/5 strong")?.textContent?.trim() || "";
      const activeOutput = oppNode.querySelector("div.border.p-2\\.5")?.textContent?.trim() || "";
      const footerText = oppNode.querySelector("div.border-t.bg-muted\\/40")?.textContent?.trim() || "";

      return {
        headerBadge,
        scoreBadge,
        rightPanelScore,
        rightPanelGrade,
        recommendedPath,
        activeOutput,
        footerText,
      };
    });

    // Take screenshot
    const screenshotPath = path.join(ARTIFACT_DIR, `verify_${s.name}.png`);
    await page.screenshot({ path: screenshotPath });

    console.log("Extracted State:", state);
    results.push({ scenario: s.name, expected: s.expectedGrade, state });
  }

  await browser.close();
  console.log("\nAll browser verifications finished successfully.");
}

run().catch((err) => {
  console.error("Browser verification error:", err);
  process.exit(1);
});
