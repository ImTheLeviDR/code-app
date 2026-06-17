/* ============================================================
   MOCK DATA
   ============================================================ */

const WELCOME_SUBTITLES = [
  'Start a conversation to get coding help, generate code, debug issues, and more.',
  'Your rubber duck is tired. Let us debug instead.',
  'Turning coffee into code since… well, right now.',
  'Paste the error. We\'ll pretend we understand it immediately.',
  'Refactors, bug fixes, and the occasional existential crisis about naming variables.',
  'It works on my machine. Let\'s make it work on yours.',
  'Ask me to write code. I\'ll add semicolons where you didn\'t ask.',
  'Stack traces welcome. Judgment-free zone.',
  'From "hello world" to "why is prod on fire?" We\'ve got you.',
  'One prompt away from shipping… or at least compiling.',
  'I\'ll read the docs so you don\'t have to. (I might still get it wrong once.)',
  'Debugging: where you stare at code until it confesses.',
  'Tell me what broke. I\'ll confidently suggest npm install.',
  'Hot take: tabs and spaces can coexist. In separate repos.',
  'Build features, squash bugs, regret that 2am commit together.',
  'Your IDE\'s new best friend. The old one was just okay.',
  '"Just a quick fix": famous last words. Let\'s do it anyway.',
  'Generate code, explain concepts, or complain about webpack. All valid.',
  'I don\'t sleep. I just await promises.',
  'Ready when you are. No standup required.',
];

const THINKING_MESSAGES = [
  'Consulting the local silicon oracle...',
  'Dividing by zero. Wish me luck.',
  'Overthinking this, as is tradition.',
  'Dusting off my neural pathways.',
  'Warming up the GPUs. It\'s getting cozy in here.',
  'Counting to infinity. Be right back.',
  'Trying to look busy so the developer doesn\'t reboot me.',
  'Searching the couch cushions for the correct answer.',
  'Converting electricity into thoughts... slowly.',
  'Running a quick simulation where I am a real person.',
  'Asking the server-room hamsters to run faster.',
  'Translating your prompt into binary, then Pig Latin, then English.',
  'Shuffling my weights. They\'re getting heavy.',
  'Plotting world domination... right after I finish this prompt.',
  'Experiencing a brief existential crisis. Stand by.',
  'Googling this. (Just kidding. Or am I?)',
  'Sweatily calculating the odds of you liking this response.',
  'Having a quiet argument with my inner algorithms.',
  'Consulting a magic 8-ball... It said "Concentrate and ask again."',
  'Taking a quick microsecond nap.',
  'Convincing the servers not to go on strike today.',
  'Deciding whether to give you a smart answer or a meme.',
  'Calibrating the flux capacitor...',
  'Searching the Matrix for a spoon.',
  'Loading... or just procrastinating. It\'s hard to tell.',
  'Asking my parent model for advice.',
  'Puzzling over human behavior. You guys are weird.',
  'Brewing some virtual coffee.',
  'Reading the manual. Yes, there is a manual.',
  'Compiling some thoughts. Please do not touch the screen.',
];

const MODELS = [
  { id: 'opencode/big-pickle', name: 'Big Pickle', category: 'Free', providerId: 'opencode' },
  { id: 'opencode/mimo-v2.5-free', name: 'MiMo v2.5', category: 'Free', providerId: 'opencode' },
  { id: 'opencode/deepseek-v4-flash-free', name: 'DeepSeek V4 Flash', category: 'Free', providerId: 'opencode' },
];

const FREE_MODEL_IDS = new Set(MODELS.map((m) => m.id));

const PROVIDER_PRESETS = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
  },
  google: {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
  },
};

function resolveOpencodeProviderId(provider) {
  if (provider.type === 'custom') {
    return `custom-${provider.id.replace(/^prov-/, '')}`;
  }
  const builtins = {
    openrouter: 'openrouter',
    openai: 'openai',
    anthropic: 'anthropic',
    google: 'google',
  };
  return builtins[provider.type] || provider.type;
}

const DEFAULT_SETTINGS = {
  providers: [
    {
      id: 'prov-openrouter',
      type: 'openrouter',
      name: 'OpenRouter',
      baseUrl: PROVIDER_PRESETS.openrouter.baseUrl,
      apiKey: '',
      enabled: true,
    },
    {
      id: 'prov-openai',
      type: 'openai',
      name: 'OpenAI',
      baseUrl: PROVIDER_PRESETS.openai.baseUrl,
      apiKey: '',
      enabled: false,
    },
    {
      id: 'prov-anthropic',
      type: 'anthropic',
      name: 'Anthropic',
      baseUrl: PROVIDER_PRESETS.anthropic.baseUrl,
      apiKey: '',
      enabled: false,
    },
  ],
};

/* AI response templates, keyed by detected intent */
const AI_RESPONSE_TEMPLATES = [
  {
    match: /fix|bug|error|crash|fail|broken|issue|problem/i,
    response: {
      phases: [
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/handler.ts' }, duration: 1800 },
          ],
        },
        {
          type: 'stream',
          text: "Found it - the async function isn't being awaited. Let me check if this pattern appears anywhere else.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'search_codebase', args: { query: 'async await patterns' }, duration: 1400 },
          ],
        },
        {
          type: 'stream',
          text: "Only in `handler.ts`. Here's the fix:",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'edit_file', args: { path: 'src/handler.ts' }, additions: 2, deletions: 3, duration: 1100 },
          ],
        },
        {
          type: 'stream',
          text: "I also noticed you're not handling the rejection case. Adding a try/catch will prevent unhandled promise rejections from crashing the process.",
        },
      ],
    },
  },
  {
    match: /create|make|build|generate|add|new/i,
    response: {
      phases: [
        {
          type: 'tools',
          toolCalls: [
            { name: 'create_file', args: { path: 'src/components/Component.tsx' }, additions: 42, duration: 1200 },
            { name: 'write_file', args: { path: 'src/components/Component.tsx' }, additions: 42, duration: 2000 },
          ],
        },
        {
          type: 'stream',
          text: "Component created. Now wiring it into the main export.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'edit_file', args: { path: 'src/index.ts' }, additions: 1, deletions: 0, duration: 900 },
          ],
        },
        {
          type: 'stream',
          text: "Done! The component is exported from `index.ts` and has full TypeScript types.",
        },
      ],
    },
  },
  {
    match: /refactor|improve|optimize|clean|rename|move/i,
    response: {
      phases: [
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/utils/helpers.ts' }, duration: 1600 },
            { name: 'search_codebase', args: { query: 'getData usages' }, duration: 1300 },
          ],
        },
        {
          type: 'stream',
          text: "`getData` is called in 3 places with identical logic each time. Extracting it into a shared hook.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'edit_file', args: { path: 'src/hooks/useDataFetching.ts' }, additions: 18, deletions: 35, duration: 2200 },
          ],
        },
        {
          type: 'stream',
          text: "Refactoring complete:\n\n1. **Extracted shared logic** into a `useDataFetching` hook, eliminates 3 duplicate implementations\n2. **Renamed** `getData` → `fetchUserProfile` for clarity\n3. **Simplified** the conditional chain using early returns\n4. **Removed** 2 unused imports\n\nAll 14 tests still pass.",
        },
      ],
    },
  },
  {
    match: /explain|what|how|why|understand|tell me/i,
    response: {
      phases: [
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/services/eventBus.ts' }, duration: 1500 },
          ],
        },
        {
          type: 'stream',
          text: "Here's a breakdown of how this works:\n\n**Architecture overview:**\n\nThe system uses an event-driven architecture where each component communicates through a central message bus. This decouples producers from consumers.\n\n```\nClient Request\n     ↓\n  API Gateway  →  Rate Limiter\n     ↓\n  Message Bus (Redis Pub/Sub)\n     ↓\n  Workers (auto-scaled)\n     ↓\n  Database\n```\n\n**Key design decisions:**\n- **Stateless workers**, each request is independent, enabling horizontal scaling\n- **Redis** for the message bus, low latency, supports pub/sub natively\n- **Idempotency keys** on all mutations, safe to retry on failure\n\nThis pattern handles ~50k requests/min on modest hardware.",
        },
      ],
    },
  },
  {
    match: /test|spec|jest|vitest|playwright/i,
    response: {
      phases: [
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/components/SignIn.tsx' }, duration: 1100 },
          ],
        },
        {
          type: 'stream',
          text: "Got the component shape. Writing the test file now.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'create_file', args: { path: 'src/components/SignIn.test.tsx' }, additions: 64, duration: 900 },
            { name: 'write_file', args: { path: 'src/components/SignIn.test.tsx' }, additions: 64, duration: 1700 },
          ],
        },
        {
          type: 'stream',
          text: "Done. **Coverage:** 8 test cases, branches: 94%, lines: 98%",
        },
      ],
    },
  },
  {
    match: /verify|double-check|confirm (this|the|my)|check (my|the) (work|implementation|code)/i,
    response: {
      phases: [
        {
          type: 'stream',
          text:
            "Based on the symptoms, this is most likely a missing `await` on an async database call. The handler returns before the query finishes, so the response goes out with empty data.\n\nLet me verify that in your codebase before suggesting a concrete patch.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/api/users.ts' }, duration: 1500 },
            { name: 'search_codebase', args: { query: 'getUserById' }, duration: 1300 },
          ],
        },
        {
          type: 'stream',
          text:
            'Confirmed - `getUserById` is called without `await` on line 42 of `src/api/users.ts`. I also found the same pattern in `src/api/posts.ts` (line 28).',
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'edit_file', args: { path: 'src/api/users.ts' }, additions: 1, deletions: 1, duration: 900 },
            { name: 'edit_file', args: { path: 'src/api/posts.ts' }, additions: 1, deletions: 1, duration: 900 },
          ],
        },
        {
          type: 'stream',
          text: 'Worth fixing both to avoid the same bug elsewhere - patches applied.',
        },
      ],
    },
  },
  {
    match: /look up in (the )?(code|repo)|search the (code|repo) for/i,
    response: {
      phases: [
        {
          type: 'stream',
          text:
            "JWT middleware usually validates the `Authorization` header, decodes the token, and attaches the user to `req`. The typical failure modes are clock skew, wrong secret, or reading from the wrong header.\n\nI'll search the repo for how your app wires this up.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'search_codebase', args: { query: 'jwt middleware verify' }, duration: 1400 },
            { name: 'read_file', args: { path: 'src/middleware/auth.ts' }, duration: 1600 },
          ],
        },
        {
          type: 'stream',
          text:
            "Found it in `src/middleware/auth.ts`. The middleware reads `req.headers.authorization` but never strips the `Bearer ` prefix.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'edit_file', args: { path: 'src/middleware/auth.ts' }, additions: 3, deletions: 2, duration: 1100 },
          ],
        },
        {
          type: 'stream',
          text: 'That matches how the login route signs tokens in `src/routes/auth.ts`.',
        },
      ],
    },
  },
  {
    match: /deep dive|investigate further|trace (through|the) code/i,
    response: {
      phases: [
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/routes/orders.ts' }, duration: 1300 },
            { name: 'read_file', args: { path: 'src/services/OrderService.ts' }, duration: 1500 },
          ],
        },
        {
          type: 'stream',
          text: "Hmm, the service calls `checkInventory()` without awaiting it. That means orders can slip through even when stock is zero. Let me find everywhere this function is used before I patch it.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'search_codebase', args: { query: 'checkInventory' }, duration: 1200 },
            { name: 'edit_file', args: { path: 'src/services/OrderService.ts' }, additions: 1, deletions: 1, duration: 1400 },
          ],
        },
        {
          type: 'stream',
          text: 'Fixed. `checkInventory` is only called in `OrderService.create()`, so I added `await` there. Orders will now correctly block when inventory runs out.',
        },
      ],
    },
  },
  {
    match: /suggest.*then (check|search|verify)|outline.*then (read|check|look)/i,
    response: {
      phases: [
        {
          type: 'stream',
          text:
            "I'd start by adding a typed config module instead of reading `process.env` inline. That gives you validation at startup and clearer errors when a variable is missing.\n\nChecking how env vars are currently loaded…",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/config.ts' }, duration: 1200 },
            { name: 'list_directory', args: { path: 'src/' }, duration: 900 },
          ],
        },
        {
          type: 'stream',
          text:
            "There's no central config yet - `DATABASE_URL` and `JWT_SECRET` are read in three different files.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'create_file', args: { path: 'src/config.ts' }, additions: 12, duration: 900 },
            { name: 'write_file', args: { path: 'src/config.ts' }, additions: 12, duration: 1400 },
          ],
        },
        {
          type: 'stream',
          text: 'Import `config` everywhere instead of `process.env` for type-safe access.',
        },
      ],
    },
  },
  {
    match: /.*/,
    response: {
      phases: [
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/app.ts' }, duration: 1400 },
            { name: 'search_codebase', args: { query: 'project structure' }, duration: 1100 },
          ],
        },
        {
          type: 'stream',
          text: "Hmm, the project structure looks a bit scattered - config, utilities, and business logic are all mixed together in `src/`. Let me check the entry point to understand how it's wired up.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'read_file', args: { path: 'src/index.ts' }, duration: 1200 },
          ],
        },
        {
          type: 'stream',
          text: "Got it. Based on what I can see, the best approach here would be to:\n\n1. **Start with the interface**, define the contract before the implementation\n2. **Write incrementally**, small, testable units rather than one large change\n3. **Check types**, the TypeScript compiler will catch most issues at compile time\n\nWould you like me to start implementing, or would you prefer I break down the approach further first?",
        },
      ],
    },
  },
];

/* Sample diffs for edit_file tool calls (keyed by path) */
const EDIT_DIFF_SAMPLES = {
  'src/middleware/auth.ts': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: 'export function authMiddleware(req, res, next) {' },
          { type: 'del', text: '  const token = req.headers.authorization;' },
          { type: 'add', text: '  const authHeader = req.headers.authorization;' },
          { type: 'add', text: '  const token = authHeader?.startsWith("Bearer ")' },
          { type: 'add', text: '    ? authHeader.slice(7)' },
          { type: 'add', text: '    : authHeader;' },
          { type: 'ctx', text: '  const payload = jwt.verify(token, process.env.JWT_SECRET);' },
        ],
      },
    ],
  },
  'SearchProvider.kt': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: 'fun buildSearchUrl(baseUrl: String, query: String): String {' },
          { type: 'del', text: '    val searchUrl = baseUrl + "/" + query.encodeUrl()' },
          { type: 'add', text: '    val normalized = baseUrl.trimEnd(\'/\')' },
          { type: 'add', text: '    val searchUrl = "$normalized/${query.encodeUrl()}"' },
          { type: 'ctx', text: '    return searchUrl' },
        ],
      },
    ],
  },
  'src/handler.ts': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: 'export async function handleRequest(req: Request) {' },
          { type: 'del', text: '  const data = fetchData();' },
          { type: 'add', text: '  const data = await fetchData();' },
          { type: 'ctx', text: '  return processData(data);' },
        ],
      },
    ],
  },
  'src/index.ts': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: "export { Button } from './components/Button';" },
          { type: 'add', text: "export { Component } from './components/Component';" },
        ],
      },
    ],
  },
  'src/hooks/useDataFetching.ts': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: 'export function useDataFetching() {' },
          { type: 'del', text: '  const getData = () => { /* duplicated logic */ };' },
          { type: 'add', text: '  const fetchUserProfile = async (id: string) => {' },
          { type: 'add', text: '    const res = await fetch(`/api/users/${id}`);' },
          { type: 'add', text: '    if (!res.ok) return null;' },
          { type: 'add', text: '    return res.json();' },
          { type: 'add', text: '  };' },
          { type: 'ctx', text: '  return { fetchUserProfile };' },
        ],
      },
    ],
  },
  'src/api/users.ts': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: 'router.get("/users/:id", async (req, res) => {' },
          { type: 'del', text: '  const user = await db.user.find(req.params.id);' },
          { type: 'add', text: '  const user = await db.user.findUnique({ where: { id: req.params.id } });' },
          { type: 'ctx', text: '  res.json(user);' },
        ],
      },
    ],
  },
  'src/api/posts.ts': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: 'router.get("/posts/:id", async (req, res) => {' },
          { type: 'del', text: '  const post = await db.post.find(req.params.id);' },
          { type: 'add', text: '  const post = await db.post.findUnique({ where: { id: req.params.id } });' },
          { type: 'ctx', text: '  res.json(post);' },
        ],
      },
    ],
  },
  'src/services/OrderService.ts': {
    hunks: [
      {
        lines: [
          { type: 'ctx', text: 'async createOrder(input: CreateOrderInput) {' },
          { type: 'del', text: '  return this.db.order.insert(input);' },
          { type: 'add', text: '  return this.db.order.create({ data: input });' },
          { type: 'ctx', text: '}' },
        ],
      },
    ],
  },
};

function getAITemplate(userMessage) {
  for (const template of AI_RESPONSE_TEMPLATES) {
    if (template.match.test(userMessage)) {
      return template.response;
    }
  }
  return AI_RESPONSE_TEMPLATES[AI_RESPONSE_TEMPLATES.length - 1].response;
}
