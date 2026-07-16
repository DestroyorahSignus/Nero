/**
 * REBELLION — the eval suite. 20 tasks, each with a programmatic check so
 * the self-correction lift is measured against ground truth, not vibes.
 * Run: npm run evals            (full loop: planner+critic+reflexion)
 *      npm run evals -- --bare  (executor only — the ablation baseline)
 */

export interface EvalTask {
  id: string;
  goal: string;
  /** Programmatic ground-truth check on the final answer text. */
  check: (answer: string) => boolean;
  category: "compute" | "data" | "reasoning" | "web";
}

const SALES_CSV = `region,product,units,revenue
North,Blade,120,24000
South,Blade,80,16000
North,Gun,200,10000
South,Gun,150,7500
East,Blade,60,12000
East,Gun,90,4500
West,Blade,140,28000
West,Gun,50,2500`;

const has = (answer: string, ...needles: (string | RegExp)[]) =>
  needles.every((n) =>
    typeof n === "string"
      ? answer.toLowerCase().includes(n.toLowerCase())
      : n.test(answer),
  );

export const TASKS: EvalTask[] = [
  // ── compute (NICO) ────────────────────────────────────────────────
  { id: "c1", category: "compute", goal: "Compute the 40th Fibonacci number (F(1)=1, F(2)=1). Give the exact integer.", check: (a) => has(a, "102334155") },
  { id: "c2", category: "compute", goal: "How many prime numbers are there below 1000? Compute it, don't recall it.", check: (a) => has(a, "168") },
  { id: "c3", category: "compute", goal: "What is the sum of the digits of 2^100? Compute exactly.", check: (a) => has(a, "115") },
  { id: "c4", category: "compute", goal: "Find the smallest positive integer divisible by every integer from 1 to 12.", check: (a) => has(a, "27720") },
  { id: "c5", category: "compute", goal: "Reverse the string 'orchestrator' and report the result exactly.", check: (a) => has(a, "rotartsehcro") },
  { id: "c6", category: "compute", goal: "How many seconds are in a non-leap year? Compute it and give the exact number.", check: (a) => has(a, /31[,.\s]?536[,.\s]?000/) },
  { id: "c7", category: "compute", goal: "Compute 17! (17 factorial) exactly.", check: (a) => has(a, /355[,.\s]?687[,.\s]?428[,.\s]?096[,.\s]?000/) },

  // ── data (KALINA ANN) ─────────────────────────────────────────────
  { id: "d1", category: "data", goal: `Given this CSV, which region has the highest total revenue and what is that total?\n\n${SALES_CSV}`, check: (a) => has(a, "west") && has(a, /30[,.\s]?500/) },
  { id: "d2", category: "data", goal: `Given this CSV, what is the total number of units sold across all rows?\n\n${SALES_CSV}`, check: (a) => has(a, "890") },
  { id: "d3", category: "data", goal: `Given this CSV, what is the mean revenue per row? Round to the nearest whole number.\n\n${SALES_CSV}`, check: (a) => has(a, /13[,.\s]?063/) },
  { id: "d4", category: "data", goal: `Given this CSV, how many units of 'Gun' were sold in total across all regions?\n\n${SALES_CSV}`, check: (a) => has(a, "490") },
  { id: "d5", category: "data", goal: `Given this CSV, which product generated more total revenue, and how much?\n\n${SALES_CSV}`, check: (a) => has(a, "blade") && has(a, /80[,.\s]?000/) },

  // ── reasoning (no tools needed; tests tool restraint) ─────────────
  { id: "r1", category: "reasoning", goal: "A bat and a ball cost $1.10 total. The bat costs $1.00 more than the ball. How much does the ball cost, in cents?", check: (a) => has(a, /\b5\b|five cents|\$0\.05/i) },
  { id: "r2", category: "reasoning", goal: "If it takes 5 machines 5 minutes to make 5 widgets, how many minutes would 100 machines take to make 100 widgets?", check: (a) => has(a, /\b5\b|five minutes/i) },
  { id: "r3", category: "reasoning", goal: "I have 3 apples. I eat one, buy a dozen more, and give half of my apples away. Exactly how many apples do I have now?", check: (a) => has(a, /\b7\b|seven/i) },
  { id: "r4", category: "reasoning", goal: "In the word 'strawberry', how many times does the letter r appear? Verify by computation, not intuition.", check: (a) => has(a, /\b3\b|three/i) },

  // ── web (BLUE ROSE; degrade gracefully without TAVILY_API_KEY) ────
  { id: "w1", category: "web", goal: "Fetch https://example.com and report the exact text of its main heading.", check: (a) => has(a, "example domain") },
  { id: "w2", category: "web", goal: "Fetch https://httpbin.org/json and report the title of the slideshow in the JSON.", check: (a) => has(a, "sample slide show") },
  { id: "w3", category: "web", goal: "What is the HTTP status situation of https://httpbin.org/status/404 ? Verify by fetching it.", check: (a) => has(a, "404") },
  { id: "w4", category: "web", goal: "Fetch https://example.com and count how many times the word 'domain' appears in its visible text. Give the exact count.", check: (a) => has(a, /\b[2-4]\b/) },
];
