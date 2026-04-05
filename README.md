# Prompt Architect for Authors

A calm, practical web app that turns rough book ideas into structured AI prompts.
Built to deploy on Vercel in minutes.

---

## What it does

You describe your book idea, chapter goal, or writing challenge. The app sends it
to Claude and returns a clear, structured prompt you can copy and use in any AI
writing tool.

Optional dropdowns let you specify your writing stage, type of help, and
preferred tone — so the output is always tailored to where you actually are.

---

## Project structure

```
prompt-architect-for-authors/
├── api/
│   ├── auth.js          ← Backend: password check (never exposes the password)
│   └── chat.js          ← Backend: the AI call lives here (server-side only)
├── public/
│   └── index.html       ← Frontend: everything the user sees
├── package.json         ← Node.js dependencies
├── vercel.json          ← Vercel routing config
└── README.md            ← This file
```

---

## Setup: local development

### 1. Install Node.js

If you don't have it, download Node.js (version 18 or higher) from:
https://nodejs.org

### 2. Install dependencies

Open Terminal, navigate to this folder, and run:

```bash
npm install
```

### 3. Add your API key and access password

Create a file called `.env` in the root of this folder:

```
ANTHROPIC_API_KEY=your-api-key-here
ACCESS_PASSWORD=your-chosen-password-here
```

- Get your Anthropic API key from: https://console.anthropic.com
- `ACCESS_PASSWORD` is the password users must enter to access the app. Choose anything you like.

**Important:** Never commit this file to Git. It is already listed in .gitignore.

### 4. Run locally

```bash
npm run dev
```

Then open http://localhost:3000 in your browser.

---

## Deployment: Vercel

### 1. Create a Vercel account

Sign up free at https://vercel.com

### 2. Install the Vercel CLI (if not already)

```bash
npm install -g vercel
```

### 3. Deploy

From inside this project folder, run:

```bash
vercel
```

Follow the prompts. Vercel will detect the project structure automatically.

### 4. Add your environment variables to Vercel

In the Vercel dashboard:
1. Go to your project → **Settings** → **Environment Variables**
2. Add each variable below, one at a time:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `ACCESS_PASSWORD` | The password you want users to enter |

3. Set **Environment** to Production (and Preview if you want)
4. Redeploy the project for the variables to take effect

Both values are stored securely by Vercel and never exposed to the browser.

### Changing the password

To change the access password:
- **Locally:** edit the `ACCESS_PASSWORD` line in your `.env` file and restart the server
- **On Vercel:** go to Settings → Environment Variables, update `ACCESS_PASSWORD`, then redeploy

---

## Customising the app

### Inserting your master system prompt

Open `api/chat.js` and find the `MASTER_SYSTEM_PROMPT` constant near the top.
Replace the placeholder text with your full Prompt Architect instructions.
This is the same content as your custom GPT's system prompt.

```js
const MASTER_SYSTEM_PROMPT = `
  // Paste your full instructions here
`;
```

### Adding a knowledge / document layer

In `api/chat.js`, find the `KNOWLEDGE_LAYER` constant just below the system prompt.
Paste in excerpts from your prompting guides, example libraries, or reference
material. This text will be included in every request.

```js
const KNOWLEDGE_LAYER = `
  // Paste your reference content here
`;
```

For a more advanced setup (many documents, PDF ingestion), this constant can
later be replaced with a call to a vector database or a pre-built retrieval
function — the placeholder comment in the file explains where to plug that in.

---

## Adding access control (V2)

The backend API route (`api/chat.js`) has a clearly marked placeholder for
authentication. To add a simple password or token gate:

1. Set an environment variable like `ACCESS_TOKEN=some-secret-value`
2. In the frontend, collect the token (e.g. a password field on first load)
3. Send it as an `Authorization` header with each request
4. In `api/chat.js`, uncomment and fill in the access control placeholder

For a full user login system, tools like Clerk or Auth0 can be integrated later.

---

## Changing the AI model

In `api/chat.js`, find this line:

```js
model: "claude-opus-4-6",
```

You can swap this for any Anthropic model, for example:
- `"claude-sonnet-4-6"` — faster and cheaper, still very capable
- `"claude-haiku-4-5-20251001"` — fastest, best for quick drafts

---

## Notes for non-developers

- **You never need to touch `vercel.json`** — it just tells Vercel how to route
  requests and can be left as-is.
- **All styling is in `public/index.html`** inside the `<style>` block at the top.
  Colours, fonts, and spacing are controlled by the `:root` variables — easy to
  adjust without knowing much CSS.
- **The AI call is entirely in `api/chat.js`** — this is the only file that
  touches your API key or sends requests to Anthropic.
