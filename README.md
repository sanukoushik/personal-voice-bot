# Sanu's AI Clone

A low-friction voice-first AI representation of Sanu, built for the 100x Stage 1 interview submission. Visitors can speak or type questions, see a streamed response, and hear the answer spoken aloud by their browser.

## Run Locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Add a Groq API key to `.env.local` before chatting and generated voice playback:

```env
GROQ_API_KEY=your_groq_api_key_here
# Optional: choose a male conversational voice (austin, daniel, or troy).
# Female voice options are hannah, autumn, and diana.
GROQ_TTS_VOICE=daniel
```

The app uses Groq's `llama-3.1-8b-instant` by default for a fast conversational experience. Set `GROQ_MODEL` to override the model.

## Deploy

Deploy the repository to Vercel and add `GROQ_API_KEY` and `GROQ_TTS_VOICE=daniel` in the project environment variables. Responses prefer the configured Groq Orpheus male voice. If Groq speech is rate-limited or unavailable, the app uses a device fallback voice and lets the visitor choose from English voices installed on that device. Browser voice recognition works best in Chrome or Edge over HTTPS; the typed chat input remains available when recognition is unsupported.

## Experience

- Browser speech recognition for fast voice questions
- Streamed Groq chat-completion answers shaped by Sanu's interview persona
- Natural Groq Orpheus text-to-speech with selectable device fallback and mute control
- Suggested interview questions and responsive dark UI
