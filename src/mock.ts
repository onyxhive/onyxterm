export type TaskStatus = "permission" | "question" | "review" | "running" | "failed" | "done";

export type Provider = "Claude Code" | "Codex";

export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface Workspace {
  id: string;
  name: string;
  projects: Project[];
}

export interface Step {
  verb: string;
  detail: string;
}

export type FeedItem =
  | { kind: "user"; text: string; time: string }
  | { kind: "agent"; markdown: string }
  | { kind: "steps"; files: number; steps: Step[] }
  | { kind: "note"; text: string }
  | { kind: "permission"; requester: string; command: string; where: string; reason: string; waited: string }
  | { kind: "question"; markdown: string; choices: string[]; waited: string };

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

export interface Work {
  phase: string;
  progress: number;
  runningNow: string;
  files: ChangedFile[];
  branch: string;
  base: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
  provider: Provider;
  command: string;
  model: string;
  effort: string;
  elapsed: string;
  workingSeconds: number;
  feed: FeedItem[];
  work: Work;
}

export interface Suggestion {
  value: string;
  hint: string;
  description: string;
}

export interface Toast {
  id: string;
  taskId: string;
  headline: string;
  detail: string;
}

export const PROVIDERS: Provider[] = ["Claude Code", "Codex"];
export const COMMANDS = ["claude", "claude-lyxa", "claude-lyxa-team"];
export const MODELS = ["Default", "Opus", "Sonnet", "Haiku", "Fable"];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export const WORKSPACES: Workspace[] = [
  {
    id: "harbor",
    name: "Harbor",
    projects: [
      { id: "atlas-web", name: "atlas-web", path: "~/harbor/atlas-web" },
      { id: "geo-svc", name: "geo-svc", path: "~/harbor/geo-svc" },
      { id: "ledger-api", name: "ledger-api", path: "~/harbor/ledger-api" },
      { id: "relay-svc", name: "relay-svc", path: "~/harbor/relay-svc" },
    ],
  },
  {
    id: "tidepool",
    name: "Tidepool",
    projects: [
      { id: "tide-ui", name: "tide-ui", path: "~/tidepool/tide-ui" },
      { id: "tide-sync", name: "tide-sync", path: "~/tidepool/tide-sync" },
    ],
  },
  {
    id: "sandbox",
    name: "Sandbox",
    projects: [{ id: "playground", name: "playground", path: "~/sandbox/playground" }],
  },
];

const EMPTY_WORK: Work = { phase: "Starting", progress: 0.05, runningNow: "", files: [], branch: "", base: "main" };

const DISTANCE_SORT_REPLY = `The ranking filters by postcode and **never sorts by distance**. \
I'm switching it to the unused \`haversine()\` helper and splitting the work across three subagents:

- **scout** maps every caller of \`rank_nearby\`
- **coding** rewrites the ranking
- **qa** writes the tie-break tests`;

const DISTANCE_SORT_FIX = `Tests caught one thing: ties were broken by store id instead of name. Fixed:

\`\`\`rust
stores.sort_by(|a, b| {
    a.distance_km
        .total_cmp(&b.distance_km)
        .then_with(|| a.name.cmp(&b.name))
});
\`\`\``;

export const TASKS: Task[] = [
  {
    id: "checkout-coupon",
    title: "Add coupon field to checkout",
    status: "permission",
    projectId: "atlas-web",
    provider: "Claude Code",
    command: "claude-lyxa-team",
    model: "Opus",
    effort: "high",
    elapsed: "4m",
    workingSeconds: 0,
    feed: [
      { kind: "user", text: "Add a coupon field to checkout and validate the code server-side.", time: "09:44" },
      { kind: "agent", markdown: "The field and the discount line are done, and the checkout tests pass." },
      {
        kind: "steps",
        files: 3,
        steps: [
          { verb: "Read", detail: "4 files in src/checkout" },
          { verb: "Created", detail: "CouponField.tsx" },
          { verb: "Edited", detail: "CheckoutSummary.tsx" },
          { verb: "Ran", detail: "npm test (14 passed)" },
          { verb: "Started", detail: "subagent qa" },
        ],
      },
      {
        kind: "agent",
        markdown: "For the server check, my **qa** subagent needs a payment client that isn't in `package.json` yet.",
      },
      {
        kind: "permission",
        requester: "subagent qa",
        command: "npm install tillpay",
        where: "~/harbor/atlas-web on wt/checkout-coupon, adds 1 package",
        reason: "I need the TillPay client to validate coupon codes on the server before applying them.",
        waited: "4m",
      },
    ],
    work: {
      phase: "Waiting on you",
      progress: 0.6,
      runningNow: "npm install tillpay",
      files: [
        { path: "src/checkout/CouponField.tsx", added: 64, removed: 0 },
        { path: "src/checkout/CheckoutSummary.tsx", added: 18, removed: 4 },
        { path: "src/checkout/coupon.test.ts", added: 41, removed: 0 },
      ],
      branch: "wt/checkout-coupon",
      base: "main",
    },
  },
  {
    id: "ledger-backfill",
    title: "Backfill ledger entry types",
    status: "question",
    projectId: "ledger-api",
    provider: "Codex",
    command: "codex",
    model: "Default",
    effort: "medium",
    elapsed: "11m",
    workingSeconds: 0,
    feed: [
      { kind: "user", text: "Backfill entry types for ledger rows created before March.", time: "09:51" },
      { kind: "agent", markdown: "Checking how entry types are stored and which rows are missing them." },
      {
        kind: "steps",
        files: 1,
        steps: [
          { verb: "Counted", detail: "rows in ledger_dev (18,412)" },
          { verb: "Read", detail: "0031_entry_type.sql" },
          { verb: "Created", detail: "backfill_entry_type.go" },
        ],
      },
      {
        kind: "question",
        markdown:
          "**18,412 rows** created before March have no `entry_type`. Should I infer it from the memo text, " +
          "or set them all to `adjustment`? Inferring covers about 92% of them; the rest still need a default.",
        choices: ["Infer from memo", "All adjustment", "Show me 20 samples first"],
        waited: "11m",
      },
    ],
    work: {
      phase: "Asked you",
      progress: 0.35,
      runningNow: "",
      files: [{ path: "migrations/backfill_entry_type.go", added: 92, removed: 0 }],
      branch: "wt/ledger-backfill",
      base: "main",
    },
  },
  {
    id: "payout-idempotency",
    title: "Idempotency keys on payouts",
    status: "review",
    projectId: "ledger-api",
    provider: "Claude Code",
    command: "claude-lyxa",
    model: "Sonnet",
    effort: "high",
    elapsed: "1m",
    workingSeconds: 0,
    feed: [
      { kind: "user", text: "Make payout creation idempotent with a client-supplied key.", time: "08:58" },
      {
        kind: "agent",
        markdown:
          "Done. Payouts now accept an `Idempotency-Key` header and replay the first response for 24 hours.\n\n" +
          "| Check | Result |\n| --- | --- |\n| Unit tests | 38 passed |\n| CI | passed |\n| PR | #412 |",
      },
    ],
    work: {
      phase: "Ready for review",
      progress: 1,
      runningNow: "",
      files: [
        { path: "src/payouts/create.rs", added: 52, removed: 9 },
        { path: "src/payouts/idempotency.rs", added: 77, removed: 0 },
      ],
      branch: "wt/payout-idempotency",
      base: "main",
    },
  },
  {
    id: "distance-sort",
    title: "Fix distance sort order",
    status: "running",
    projectId: "geo-svc",
    provider: "Claude Code",
    command: "claude-lyxa-team",
    model: "Opus",
    effort: "high",
    elapsed: "18m",
    workingSeconds: 42,
    feed: [
      {
        kind: "user",
        text: "Sort nearby stores by real distance, ties broken by name. Add a test with three stores.",
        time: "09:44",
      },
      { kind: "agent", markdown: DISTANCE_SORT_REPLY },
      {
        kind: "steps",
        files: 3,
        steps: [
          { verb: "Read", detail: "3 files in src/nearby" },
          { verb: "Searched", detail: "postcode" },
          { verb: "Started", detail: "scout, coding and qa" },
          { verb: "Edited", detail: "nearby.rs, mod.rs" },
          { verb: "Created", detail: "nearby_sort.rs" },
          { verb: "Ran", detail: "cargo check" },
        ],
      },
      { kind: "agent", markdown: DISTANCE_SORT_FIX },
      {
        kind: "steps",
        files: 1,
        steps: [
          { verb: "Ran", detail: "cargo test (1 failed)" },
          { verb: "Edited", detail: "nearby.rs" },
        ],
      },
    ],
    work: {
      phase: "Testing",
      progress: 0.75,
      runningNow: "cargo test nearby",
      files: [
        { path: "src/nearby/nearby.rs", added: 36, removed: 10 },
        { path: "src/nearby/mod.rs", added: 1, removed: 0 },
        { path: "tests/nearby_sort.rs", added: 48, removed: 0 },
      ],
      branch: "wt/distance-sort",
      base: "main",
    },
  },
  {
    id: "invoice-pagination",
    title: "Paginate the invoice list",
    status: "running",
    projectId: "ledger-api",
    provider: "Codex",
    command: "codex",
    model: "Default",
    effort: "medium",
    elapsed: "6m",
    workingSeconds: 371,
    feed: [
      { kind: "user", text: "Paginate the invoice list, 50 per page, cursor-based, with tests.", time: "10:02" },
      { kind: "agent", markdown: "Adding a `cursor` query param and an opaque `next_cursor` in the response." },
    ],
    work: {
      ...EMPTY_WORK,
      phase: "Coding",
      progress: 0.4,
      runningNow: "go test ./invoices/...",
      branch: "wt/invoices",
    },
  },
  {
    id: "pricing-engine",
    title: "Extract pricing rules engine",
    status: "running",
    projectId: "atlas-web",
    provider: "Claude Code",
    command: "claude-lyxa-team",
    model: "Opus",
    effort: "max",
    elapsed: "32m",
    workingSeconds: 1920,
    feed: [{ kind: "user", text: "Pull the pricing rules out of the cart into their own module.", time: "09:30" }],
    work: { ...EMPTY_WORK, phase: "Planning", progress: 0.2, branch: "wt/pricing-engine" },
  },
  {
    id: "webhook-retry",
    title: "Retry failed webhook sends",
    status: "running",
    projectId: "relay-svc",
    provider: "Claude Code",
    command: "claude",
    model: "Sonnet",
    effort: "medium",
    elapsed: "3m",
    workingSeconds: 180,
    feed: [{ kind: "user", text: "Retry failed webhook sends with exponential backoff, max 5 tries.", time: "10:11" }],
    work: { ...EMPTY_WORK, phase: "Reading", progress: 0.1, branch: "wt/webhook-retry" },
  },
  {
    id: "orders-export",
    title: "Fix orders export DTO",
    status: "failed",
    projectId: "atlas-web",
    provider: "Claude Code",
    command: "claude-lyxa",
    model: "Sonnet",
    effort: "high",
    elapsed: "3m",
    workingSeconds: 0,
    feed: [
      { kind: "user", text: "The orders export drops the currency field. Fix the DTO.", time: "09:20" },
      {
        kind: "agent",
        markdown: "CI failed **3 times** on `export.spec.ts`. The snapshot still expects the old shape.",
      },
    ],
    work: { ...EMPTY_WORK, phase: "Failed", progress: 0.8, branch: "wt/orders-export" },
  },
  {
    id: "saved-addresses",
    title: "Empty state for saved addresses",
    status: "done",
    projectId: "atlas-web",
    provider: "Claude Code",
    command: "claude-lyxa",
    model: "Haiku",
    effort: "low",
    elapsed: "2h",
    workingSeconds: 0,
    feed: [{ kind: "user", text: "Add an empty state to the saved addresses page.", time: "Yesterday" }],
    work: { ...EMPTY_WORK, phase: "Merged", progress: 1, branch: "wt/addresses-empty" },
  },
  {
    id: "router-v7",
    title: "Upgrade router to v7",
    status: "done",
    projectId: "atlas-web",
    provider: "Codex",
    command: "codex",
    model: "Default",
    effort: "high",
    elapsed: "5h",
    workingSeconds: 0,
    feed: [{ kind: "user", text: "Upgrade react-router to v7 and run the codemod.", time: "Yesterday" }],
    work: { ...EMPTY_WORK, phase: "Merged", progress: 1, branch: "wt/router-v7" },
  },
  {
    id: "tide-offline",
    title: "Offline queue for sync",
    status: "running",
    projectId: "tide-sync",
    provider: "Claude Code",
    command: "claude-lyxa-team",
    model: "Opus",
    effort: "high",
    elapsed: "9m",
    workingSeconds: 540,
    feed: [{ kind: "user", text: "Queue writes while offline and flush them on reconnect.", time: "10:05" }],
    work: { ...EMPTY_WORK, phase: "Coding", progress: 0.5, branch: "wt/offline-queue" },
  },
];

export const SLASH_COMMANDS: Suggestion[] = [
  { value: "/review", hint: "[pr]", description: "Review a pull request or the current diff" },
  { value: "/compact", hint: "[focus]", description: "Summarise the chat to free up context" },
  { value: "/clear", hint: "", description: "Start the chat over with an empty context" },
  { value: "/model", hint: "<name>", description: "Switch the model for this chat" },
  { value: "/agents", hint: "", description: "List and edit subagents" },
  { value: "/init", hint: "", description: "Write a CLAUDE.md for this project" },
  { value: "/cost", hint: "", description: "Show tokens and spend for this chat" },
  { value: "/permissions", hint: "", description: "Review allowed and denied tools" },
];

export const MENTIONS: Suggestion[] = [
  { value: "@src/nearby/nearby.rs", hint: "file", description: "geo-svc" },
  { value: "@src/nearby/mod.rs", hint: "file", description: "geo-svc" },
  { value: "@src/checkout/CouponField.tsx", hint: "file", description: "atlas-web" },
  { value: "@package.json", hint: "file", description: "atlas-web" },
  { value: "@agent-scout", hint: "agent", description: "Maps code and finds callers" },
  { value: "@agent-coding", hint: "agent", description: "Implements changes" },
  { value: "@agent-qa", hint: "agent", description: "Writes and runs tests" },
];

export const TOASTS: Toast[] = [
  {
    id: "toast-coupon",
    taskId: "checkout-coupon",
    headline: "Add coupon field to checkout needs you",
    detail: "qa wants to run npm install tillpay",
  },
  {
    id: "toast-ledger",
    taskId: "ledger-backfill",
    headline: "Backfill ledger entry types asked a question",
    detail: "Infer entry types from memo text?",
  },
];
