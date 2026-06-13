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

const MODELS = [
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'o3', label: 'o3' },
  { id: 'o4-mini', label: 'o4-mini' },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4', label: 'Claude Opus 4' },
];

const PROVIDER_PRESETS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.4', 'gpt-4.1', 'o3', 'o4-mini'],
    imageModels: ['gpt-4o', 'gpt-4o-mini'],
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4', 'claude-opus-4'],
    imageModels: [],
  },
  google: {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    models: ['gemini-2.5-pro', 'gemini-2.0-flash'],
    imageModels: ['gemini-2.0-flash'],
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
    models: [],
    imageModels: [],
  },
};

const DEFAULT_SETTINGS = {
  providers: [
    {
      id: 'prov-openai',
      type: 'openai',
      name: 'OpenAI',
      baseUrl: PROVIDER_PRESETS.openai.baseUrl,
      apiKey: '',
      enabled: true,
      models: [...PROVIDER_PRESETS.openai.models],
      imageModels: [...PROVIDER_PRESETS.openai.imageModels],
    },
    {
      id: 'prov-anthropic',
      type: 'anthropic',
      name: 'Anthropic',
      baseUrl: PROVIDER_PRESETS.anthropic.baseUrl,
      apiKey: '',
      enabled: false,
      models: [...PROVIDER_PRESETS.anthropic.models],
      imageModels: [...PROVIDER_PRESETS.anthropic.imageModels],
    },
  ],
};

const PROJECTS = [
  {
    id: 'assistant',
    name: 'assistant',
    color: '#6d28d9',
    chats: [
      { id: 'a1', title: 'Make a new folder, called "age..."', time: '1mo' },
    ],
  },
  {
    id: 'snycmod',
    name: 'SnycMod',
    color: '#0ea5e9',
    chats: [
      { id: 's1', title: 'Make a 1.8-76.1.2 (latest) fabr...', time: '1mo' },
    ],
  },
  {
    id: 'llexa',
    name: 'llexa',
    color: '#10b981',
    chats: [
      { id: 'l1', title: 'Troubleshoot ECONNREFUSED', time: '1mo' },
      { id: 'l2', title: 'Find DATABASE_URL usage', time: '1mo' },
      { id: 'l3', title: 'Fix deprecation warnings', time: '1mo' },
      { id: 'l6', title: 'Verify JWT middleware', time: '2w' },
      { id: 'l4', title: 'Update deployment docs', time: '1mo' },
      { id: 'l5', title: 'Fix vercel.json for multi-sites', time: '1mo' },
    ],
  },
  {
    id: 'translator',
    name: 'translator',
    color: '#f59e0b',
    chats: [
      { id: 't1', title: 'Remove status indicator bar', time: '2mo' },
      { id: 't2', title: 'Redesign frontend with dark mode', time: '2mo' },
    ],
  },
  {
    id: 'kvaesitso',
    name: 'Kvaesitso',
    color: '#ec4899',
    chats: [
      { id: 'k1', title: 'Fix web search URL issue', time: '2mo' },
      { id: 'k2', title: 'Improve drawer search suggestions', time: '2mo' },
    ],
  },
  {
    id: 'eaglensserver',
    name: 'eaglensserver',
    color: '#64748b',
    chats: [
      { id: 'e1', title: 'Update websocket server config', time: '2mo' },
    ],
  },
  {
    id: 'archive',
    name: 'archive',
    color: '#374151',
    chats: [
      { id: 'ar1', title: 'Migrate old API routes', time: '3mo' },
      { id: 'ar2', title: 'Clean up unused dependencies', time: '3mo' },
    ],
  },
];

/* Pre-populated messages for existing chats */
const CHAT_MESSAGES = {
  l1: [
    {
      id: 'l1m1',
      role: 'user',
      content: "I'm getting ECONNREFUSED errors when trying to connect to my database. Here's the error:\n\nError: connect ECONNREFUSED 127.0.0.1:5432\n    at TCPConnectWrap.afterConnect [as oncomplete]",
    },
    {
      id: 'l1m2',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc1',
          name: 'read_file',
          args: { path: '.env' },
          result: 'DATABASE_URL=postgresql://localhost:5432/mydb\nNODE_ENV=production\nPORT=3000',
          status: 'complete',
        },
        {
          id: 'tc2',
          name: 'run_terminal_cmd',
          args: { command: 'pg_isready -h localhost -p 5432' },
          result: 'localhost:5432 - no response',
          status: 'complete',
        },
      ],
      content: "I've investigated the database connection issue. Here's what I found:\n\n**Root cause:** PostgreSQL isn't running on your machine. The `pg_isready` check confirms port 5432 has no response.\n\nYour `.env` configuration looks correct, the issue is the service itself isn't started.\n\n**To fix this:**\n\n```bash\n# Linux / WSL\nsudo service postgresql start\n\n# macOS with Homebrew\nbrew services start postgresql@15\n\n# Windows (PowerShell as admin)\nStart-Service -Name 'postgresql-x64-15'\n```\n\nAfter starting the service, verify it's running:\n\n```bash\npg_isready -h localhost -p 5432\n# Should output: localhost:5432 - accepting connections\n```\n\nIf you're on a remote server or Docker, you may also need to check that the container is running and the port is exposed.",
    },
    {
      id: 'l1m3',
      role: 'user',
      content: 'That worked! The service was stopped. Now I have a different error though, "password authentication failed for user postgres"',
    },
    {
      id: 'l1m4',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc3',
          name: 'read_file',
          args: { path: 'prisma/schema.prisma' },
          result: 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}',
          status: 'complete',
        },
      ],
      content: 'Authentication failed, the password in your `DATABASE_URL` doesn\'t match the PostgreSQL user\'s actual password.\n\n**Fix the connection string in `.env`:**\n\n```bash\n# Format: postgresql://USER:PASSWORD@HOST:PORT/DBNAME\nDATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/mydb"\n```\n\nIf you\'ve forgotten the postgres password, reset it:\n\n```bash\nsudo -u postgres psql\nALTER USER postgres PASSWORD \'newpassword\';\n\\q\n```\n\nThen update your `.env` with the new password.',
    },
  ],

  l6: [
    {
      id: 'l6m1',
      role: 'user',
      content: 'Can you verify my JWT middleware implementation? Requests with valid tokens still return 401.',
    },
    {
      id: 'l6m2',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc13',
          name: 'search_codebase',
          args: { query: 'jwt middleware verify' },
          result: 'Found in src/middleware/auth.ts',
          status: 'complete',
        },
        {
          id: 'tc14',
          name: 'read_file',
          args: { path: 'src/middleware/auth.ts' },
          result: 'const token = req.headers.authorization;\nconst payload = jwt.verify(token, process.env.JWT_SECRET);',
          status: 'complete',
        },
      ],
      content:
        "JWT middleware usually validates the `Authorization` header, decodes the token, and attaches the user to `req`. The typical failure modes are clock skew, wrong secret, or reading from the wrong header.\n\nI'll search the repo for how your app wires this up.\n\nFound it in `src/middleware/auth.ts`. The middleware reads `req.headers.authorization` but never strips the `Bearer ` prefix:\n\n```typescript\nconst token = req.headers.authorization;\nconst payload = jwt.verify(token, process.env.JWT_SECRET);\n```\n\n**Fix:**\n```typescript\nconst header = req.headers.authorization;\nif (!header?.startsWith('Bearer ')) return res.status(401).end();\nconst token = header.slice(7);\nconst payload = jwt.verify(token, process.env.JWT_SECRET);\n```",
    },
  ],

  l2: [
    {
      id: 'l2m1',
      role: 'user',
      content: 'Find all places in the codebase where DATABASE_URL is used',
    },
    {
      id: 'l2m2',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc4',
          name: 'search_codebase',
          args: { query: 'DATABASE_URL', include_pattern: '**/*.{ts,js,env*}' },
          result: 'Found 8 matches in 6 files:\n- .env (line 1)\n- .env.example (line 3)\n- src/db/client.ts (line 4)\n- src/db/migrate.ts (line 2)\n- docker-compose.yml (line 18)\n- README.md (line 42)',
          status: 'complete',
        },
        {
          id: 'tc5',
          name: 'read_file',
          args: { path: 'src/db/client.ts' },
          result: "import { PrismaClient } from '@prisma/client';\n\nconst globalForPrisma = globalThis as unknown as {\n  prisma: PrismaClient | undefined;\n};\n\nexport const prisma =\n  globalForPrisma.prisma ??\n  new PrismaClient({\n    datasourceUrl: process.env.DATABASE_URL,\n  });\n\nif (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;",
          status: 'complete',
        },
      ],
      content: 'Found **8 usages** across 6 files. Here\'s a summary:\n\n| File | Usage |\n|------|-------|\n| `.env` | Definition |\n| `.env.example` | Template placeholder |\n| `src/db/client.ts` | Prisma client init |\n| `src/db/migrate.ts` | Migration runner |\n| `docker-compose.yml` | Container env var |\n| `README.md` | Documentation |\n\nThe primary usage is in `src/db/client.ts` where Prisma reads it at startup. Everything looks standard, no hardcoded fallbacks which is good practice.',
    },
  ],

  t2: [
    {
      id: 't2m1',
      role: 'user',
      content: 'I want to redesign the frontend with a dark mode first approach. Start by updating the color system',
    },
    {
      id: 't2m2',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc6',
          name: 'read_file',
          args: { path: 'src/styles/globals.css' },
          result: ':root {\n  --bg: #ffffff;\n  --text: #000000;\n  --primary: #3b82f6;\n}\n\nbody {\n  background: var(--bg);\n  color: var(--text);\n}',
          status: 'complete',
        },
        {
          id: 'tc7',
          name: 'write_file',
          args: { path: 'src/styles/globals.css' },
          result: 'Written 48 lines',
          status: 'complete',
        },
      ],
      content: "I've redesigned the color system with a dark-first approach. Here's what changed:\n\n```css\n:root {\n  /* Dark mode (default) */\n  --bg-base:    #0a0a0a;\n  --bg-surface: #111111;\n  --bg-elevated: #1a1a1a;\n  \n  --text-primary:   #f0f0f0;\n  --text-secondary: #888;\n  --text-muted:     #555;\n  \n  --accent:   #6366f1;\n  --accent-2: #8b5cf6;\n  --border:   #222;\n}\n\n@media (prefers-color-scheme: light) {\n  :root {\n    --bg-base:    #fafafa;\n    --bg-surface: #ffffff;\n    --text-primary: #111;\n    /* ... */\n  }\n}\n```\n\nThis approach means dark mode is the baseline, with light mode as an override. Users who prefer light mode still get it automatically via `prefers-color-scheme`.",
    },
  ],

  k1: [
    {
      id: 'k1m1',
      role: 'user',
      content: 'The web search feature is broken. When I search for something, the URL it opens is wrong, it has double slashes',
    },
    {
      id: 'k1m2',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc8',
          name: 'search_codebase',
          args: { query: 'searchUrl', file_pattern: '**/*.kt' },
          result: 'Found in SearchProvider.kt line 84',
          status: 'complete',
        },
        {
          id: 'tc9',
          name: 'read_file',
          args: { path: 'app/src/main/kotlin/ir/alirezaivaz/kvaesitso/search/SearchProvider.kt', line_range: '80-95' },
          result: 'val searchUrl = baseUrl + "/" + query.encodeUrl()\n// outputs: https://google.com//search?q=hello',
          status: 'complete',
        },
        {
          id: 'tc10',
          name: 'edit_file',
          args: { path: 'SearchProvider.kt', line: 84 },
          result: 'Applied fix',
          status: 'complete',
        },
      ],
      content: "Found it! The bug is in `SearchProvider.kt`, the base URL already ends with `/` and you're prepending another `/`.\n\n**Before:**\n```kotlin\nval searchUrl = baseUrl + \"/\" + query.encodeUrl()\n// → https://google.com//search?q=hello  ❌\n```\n\n**After:**\n```kotlin\nval searchUrl = baseUrl.trimEnd('/') + \"/\" + query.encodeUrl()\n// → https://google.com/search?q=hello  ✓\n```\n\nI've applied the fix. The `trimEnd('/')` call normalizes the base URL before concatenation so it works correctly regardless of whether the stored URL has a trailing slash.",
    },
  ],

  s1: [
    {
      id: 's1m1',
      role: 'user',
      content: 'Make a fabric mod for Minecraft 1.8-76.1.2 that adds a night vision potion that lasts forever',
    },
    {
      id: 's1m2',
      role: 'assistant',
      toolCalls: [
        {
          id: 'tc11',
          name: 'create_file',
          args: { path: 'src/main/java/com/example/NightVisionMod.java' },
          result: 'File created',
          status: 'complete',
        },
        {
          id: 'tc12',
          name: 'write_file',
          args: { path: 'src/main/resources/fabric.mod.json' },
          result: 'Written',
          status: 'complete',
        },
      ],
      content: "Here's the complete Fabric mod setup:\n\n**`NightVisionMod.java`**\n```java\n@Mod(\"nightvision\")\npublic class NightVisionMod implements ModInitializer {\n    @Override\n    public void onInitialize() {\n        ServerTickEvents.END_SERVER_TICK.register(server -> {\n            for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {\n                if (!player.hasStatusEffect(StatusEffects.NIGHT_VISION)) {\n                    player.addStatusEffect(new StatusEffectInstance(\n                        StatusEffects.NIGHT_VISION,\n                        Integer.MAX_VALUE, // forever\n                        0,    // level I\n                        true, // ambient (no particles)\n                        false // no icon\n                    ));\n                }\n            }\n        });\n    }\n}\n```\n\nThis applies Night Vision to all players every tick (only adds it if not already present, so it's efficient). The `Integer.MAX_VALUE` duration makes it effectively permanent.",
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
          text: "Found it — the async function isn't being awaited. Let me check if this pattern appears anywhere else.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'search_codebase', args: { query: 'async await patterns' }, duration: 1400 },
          ],
        },
        {
          type: 'stream',
          text: "Only in `handler.ts`. Here's the fix:\n\n```typescript\n// Before (buggy)\nfunction handleRequest(req: Request) {\n  const data = fetchData(); // missing await!\n  return processData(data);\n}\n\n// After (fixed)\nasync function handleRequest(req: Request) {\n  const data = await fetchData();\n  return processData(data);\n}\n```\n\nI also noticed you're not handling the rejection case. Adding a try/catch will prevent unhandled promise rejections from crashing the process.",
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
            { name: 'create_file', args: { path: 'src/components/Component.tsx' }, duration: 1200 },
            { name: 'write_file', args: { path: 'src/components/Component.tsx' }, duration: 2000 },
          ],
        },
        {
          type: 'stream',
          text: "Component created. Now wiring it into the main export.",
        },
        {
          type: 'tools',
          toolCalls: [
            { name: 'edit_file', args: { path: 'src/index.ts' }, duration: 900 },
          ],
        },
        {
          type: 'stream',
          text: "Done! Here's what was generated:\n\n```typescript\nexport interface ComponentProps {\n  title: string;\n  description?: string;\n  onAction: () => void;\n  variant?: 'primary' | 'secondary' | 'ghost';\n}\n\nexport const Component: React.FC<ComponentProps> = ({\n  title,\n  description,\n  onAction,\n  variant = 'primary',\n}) => {\n  return (\n    <div className={`component component--${variant}`}>\n      <h2>{title}</h2>\n      {description && <p>{description}</p>}\n      <button onClick={onAction}>Action</button>\n    </div>\n  );\n};\n```\n\nThe component is exported from `index.ts` and has full TypeScript types.",
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
            { name: 'edit_file', args: { path: 'src/hooks/useDataFetching.ts' }, duration: 2200 },
          ],
        },
        {
          type: 'stream',
          text: "Refactoring complete:\n\n1. **Extracted shared logic** into a `useDataFetching` hook, eliminates 3 duplicate implementations\n2. **Renamed** `getData` → `fetchUserProfile` for clarity\n3. **Simplified** the conditional chain using early returns\n4. **Removed** 2 unused imports\n\nBefore: 87 lines | After: **52 lines** (-40%)\n\nAll 14 tests still pass.",
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
            { name: 'create_file', args: { path: 'src/components/SignIn.test.tsx' }, duration: 900 },
            { name: 'write_file', args: { path: 'src/components/SignIn.test.tsx' }, duration: 1700 },
          ],
        },
        {
          type: 'stream',
          text: "Done. Here's the test suite:\n\n```typescript\ndescribe('UserAuth', () => {\n  it('signs in with valid credentials', async () => {\n    const { getByRole, user } = render(<SignIn />);\n    await user.type(getByRole('textbox', { name: /email/i }), 'user@test.com');\n    await user.type(getByRole('textbox', { name: /password/i }), 'password123');\n    await user.click(getByRole('button', { name: /sign in/i }));\n    expect(mockSignIn).toHaveBeenCalledWith({\n      email: 'user@test.com',\n      password: 'password123',\n    });\n  });\n\n  it('shows error on invalid credentials', async () => {\n    mockSignIn.mockRejectedValueOnce(new Error('Invalid credentials'));\n    expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();\n  });\n});\n```\n\n**Coverage:** 8 test cases, branches: 94%, lines: 98%",
        },
      ],
    },
  },
  {
    match: /verify|double-check|confirm (this|the|my)|check (my|the) (work|implementation|code)/i,
    response: {
      textBefore:
        "Based on the symptoms, this is most likely a missing `await` on an async database call. The handler returns before the query finishes, so the response goes out with empty data.\n\nLet me verify that in your codebase before suggesting a concrete patch.",
      toolCalls: [
        { name: 'read_file', args: { path: 'src/api/users.ts' }, duration: 1500 },
        { name: 'search_codebase', args: { query: 'getUserById' }, duration: 1300 },
      ],
      text:
        "Confirmed — `getUserById` is called without `await` on line 42 of `src/api/users.ts`:\n\n```typescript\n// Before\nconst user = getUserById(id);\nreturn res.json(user);\n\n// After\nconst user = await getUserById(id);\nreturn res.json(user);\n```\n\nI also found the same pattern in `src/api/posts.ts` (line 28). Worth fixing both to avoid the same bug elsewhere.",
    },
  },
  {
    match: /look up in (the )?(code|repo)|search the (code|repo) for/i,
    response: {
      textBefore:
        "JWT middleware usually validates the `Authorization` header, decodes the token, and attaches the user to `req`. The typical failure modes are clock skew, wrong secret, or reading from the wrong header.\n\nI'll search the repo for how your app wires this up.",
      toolCalls: [
        { name: 'search_codebase', args: { query: 'jwt middleware verify' }, duration: 1400 },
        { name: 'read_file', args: { path: 'src/middleware/auth.ts' }, duration: 1600 },
      ],
      text:
        "Found it in `src/middleware/auth.ts`. The middleware reads `req.headers.authorization` but never strips the `Bearer ` prefix:\n\n```typescript\nconst token = req.headers.authorization;\nconst payload = jwt.verify(token, process.env.JWT_SECRET);\n```\n\n**Fix:**\n```typescript\nconst header = req.headers.authorization;\nif (!header?.startsWith('Bearer ')) return res.status(401).end();\nconst token = header.slice(7);\nconst payload = jwt.verify(token, process.env.JWT_SECRET);\n```\n\nThat matches how the login route signs tokens in `src/routes/auth.ts`.",
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
            { name: 'edit_file', args: { path: 'src/services/OrderService.ts' }, duration: 1400 },
          ],
        },
        {
          type: 'stream',
          text: "Fixed. `checkInventory` is only called in `OrderService.create()`, so I added `await` there. Orders will now correctly block when inventory runs out.\n\n```typescript\n// before\ncheckInventory(items);\n\n// after\nawait checkInventory(items);\n```",
        },
      ],
    },
  },
  {
    match: /suggest.*then (check|search|verify)|outline.*then (read|check|look)/i,
    response: {
      textBefore:
        "I'd start by adding a typed config module instead of reading `process.env` inline. That gives you validation at startup and clearer errors when a variable is missing.\n\nChecking how env vars are currently loaded…",
      toolCalls: [
        { name: 'read_file', args: { path: 'src/config.ts' }, duration: 1200 },
        { name: 'list_directory', args: { path: 'src/' }, duration: 900 },
      ],
      text:
        "There's no central config yet — `DATABASE_URL` and `JWT_SECRET` are read in three different files. Here's a minimal `src/config.ts` you can add:\n\n```typescript\nimport { z } from 'zod';\n\nconst env = z.object({\n  DATABASE_URL: z.string().url(),\n  JWT_SECRET: z.string().min(32),\n  PORT: z.coerce.number().default(3000),\n}).parse(process.env);\n\nexport const config = env;\n```\n\nImport `config` everywhere instead of `process.env` for type-safe access.",
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
          text: "Hmm, the project structure looks a bit scattered — config, utilities, and business logic are all mixed together in `src/`. Let me check the entry point to understand how it's wired up.",
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

function getAITemplate(userMessage) {
  for (const template of AI_RESPONSE_TEMPLATES) {
    if (template.match.test(userMessage)) {
      return template.response;
    }
  }
  return AI_RESPONSE_TEMPLATES[AI_RESPONSE_TEMPLATES.length - 1].response;
}
