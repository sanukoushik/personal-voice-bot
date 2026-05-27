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
# Optional: change the conversational voice (hannah, autumn, diana, austin, daniel, or troy).
# GROQ_TTS_VOICE=hannah
```

The app uses Groq's `llama-3.1-8b-instant` by default for a fast conversational experience. Set `GROQ_MODEL` to override the model.

## Deploy

Deploy the repository to Vercel and add `GROQ_API_KEY` in the project environment variables. Responses use Groq Orpheus generated speech for a natural conversational voice, with browser speech as a fallback. Browser voice recognition works best in Chrome or Edge over HTTPS; the typed chat input remains available when recognition is unsupported.

## Experience

- Browser speech recognition for fast voice questions
- Streamed Groq chat-completion answers shaped by Sanu's interview persona
- Natural Groq Orpheus text-to-speech with browser fallback and mute control
- Suggested interview questions and responsive dark UI
