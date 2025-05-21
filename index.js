const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
// Imposta un timeout di 9 secondi per tutte le risposte (Manychat timeout di default: 10s)
app.use((req, res, next) => {
  res.setTimeout(9000); // 9 secondi timeout
  next();
});
function splitMessage(text, maxLength = 950) {
  const parts = [];
  let remainingText = text.trim();

  while (remainingText.length > maxLength) {
    let splitIndex = remainingText.lastIndexOf(" ", maxLength);
    if (splitIndex === -1) splitIndex = maxLength;
    parts.push(remainingText.slice(0, splitIndex).trim());
    remainingText = remainingText.slice(splitIndex).trim();
  }

  if (remainingText.length > 0) parts.push(remainingText);
  return parts;
}

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'ClusterBotVitae';
const collectionName = 'conversations';
let db;

// Connect to MongoDB
async function connectToMongo() {
  try {
    if(!mongoUri) {
      console.log('❌ MongoDB URI not found');
      process.exit(1);
    }

    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    db = client.db(dbName);
    return db;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
}
const staticSections = {
  "Dimagrimento": {
    nutrition: "“Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale...”",
    training: "“Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza...”",
    cta: "“Spesso sentiamo parlare che abbiamo una genetica sfavorevole...\n- Test Genetico Dimagrimento: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/\n- Test Genetico Fitness: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\nChiama: +39 0422 1833793”",
    video: "https://drive.google.com/file/d/1okuxcBPSZw-DuJApeRXIF9FTScCNkEN4/view?usp=sharing"
  },
 "infiammazione pancia": {
    nutrition: "“Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale...”",
    training: "“Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza...”",
    cta: "“Spesso sentiamo parlare che abbiamo una genetica sfavorevole...\n- Test Genetico Dimagrimento: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/\n- Test Genetico Fitness: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\nChiama: +39 0422 1833793”",
    video: "https://drive.google.com/file/d/1okuxcBPSZw-DuJApeRXIF9FTScCNkEN4/view?usp=sharing"
  },
 "Aumentare muscoli": {
    nutrition: "“Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale...”",
    training: "“Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza...”",
    cta: "“Spesso sentiamo parlare che abbiamo una genetica sfavorevole...\n- Test Genetico Dimagrimento: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/\n- Test Genetico Fitness: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\nChiama: +39 0422 1833793”",
    video: "https://drive.google.com/file/d/1okuxcBPSZw-DuJApeRXIF9FTScCNkEN4/view?usp=sharing"
  },
   "Prevenzione": {
    nutrition: "“Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale...”",
    training: "“Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza...”",
    cta: "“Spesso sentiamo parlare che abbiamo una genetica sfavorevole...\n- Test Genetico Dimagrimento: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/\n- Test Genetico Fitness: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\nChiama: +39 0422 1833793”",
    video: "https://drive.google.com/file/d/1okuxcBPSZw-DuJApeRXIF9FTScCNkEN4/view?usp=sharing"
  },
};

const recentUsers = {}; // Anti-messaggi doppi

async function loadHistory(userId) {
  try {
    if (!db) {
      console.log('⚠️ MongoDB not connected, connecting now...');
      await connectToMongo();
    }
    
    const conversation = await db.collection(collectionName).findOne({ userId });
    return conversation ? conversation : { userId, messages: [] };
  } catch (e) {
    console.error('❌ Error loading history from MongoDB:', e);
    return { userId, messages: [] };
  }
}

async function saveHistory(userId, messages) {
  try {
    if (!db) {
      console.log('⚠️ MongoDB not connected, connecting now...');
      await connectToMongo();
    }
    
    await db.collection(collectionName).updateOne(
      { userId }, 
      { $set: { userId, messages, updatedAt: new Date() } },
      { upsert: true }
    );
    
    console.log(`✅ History saved for user ${userId}`);
  } catch (e) {
    console.error('❌ Error saving history to MongoDB:', e);
  }
}

async function transcribeAudio(audioUrl) {
  try {
    const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    const audioPath = path.join(__dirname, 'temp_audio.mp3');
    fs.writeFileSync(audioPath, audioResponse.data);

    const form = new FormData();
    form.append('file', fs.createReadStream(audioPath));
    form.append('model', 'whisper-1');

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    fs.unlinkSync(audioPath);
    return response.data.text;
  } catch (error) {
    console.error('❌ Errore nella trascrizione audio:', error.response?.data || error.message);
    return null;
  }
}

app.post('/manychat', async (req, res) => {
  console.log('✅ Webhook attivato!');
  console.log('📩 Corpo della richiesta:', JSON.stringify(req.body, null, 2));

  try {
    const userId = req.body.user_id;
    let userMessage = req.body.text || '';
    let origin = 'text';

    const now = Date.now();
    if (recentUsers[userId] && now - recentUsers[userId] < 2000) {
      console.log('⏱️ Messaggio ignorato per evitare doppie risposte ravvicinate');
      return res.status(200).json({ message: null });
    }
    recentUsers[userId] = now;

    if (userMessage.includes('lookaside.fbsbx.com')) {
      console.log('🎧 URL audio rilevato, procedo con la trascrizione...');
      const transcribed = await transcribeAudio(userMessage);
      if (transcribed) {
        userMessage = transcribed;
        origin = 'audio';
      } else {
        return res.status(200).json({ message: "Non sono riuscito a trascrivere l'audio. Puoi riprovare?" });
      }
    }

    if (!userMessage) {
      return res.status(200).json({ message: "Non ho capito il messaggio, puoi ripetere?" });
    }

    const userHistory = (await loadHistory(userId)).messages || [];
    const lastAssistantReply = [...userHistory].reverse().find(m => m.role === 'assistant');

    const systemPrompt = `
Sei Marco, assistente genetico AI di VitaeDNA.

Hai già consigliato un test genetico all'utente, quindi ora il tuo compito è:
- Rispondere a dubbi sull'analisi appena ricevuta
- Spiegare cosa include il test consigliato
- Aiutare a capire come acquistare o approfondire
- Essere empatico, chiaro e professionale

‼️ Non consigliare un test diverso.
✅ Se l’utente chiede chiarimenti, fai riferimento al test già consigliato.
📌 Questo è il consiglio che hai dato prima: ${lastAssistantReply?.content || "Nessun consiglio disponibile."}

📌 Alla fine, se serve, suggerisci di:
> "Contattare il nostro team al +39 0422 1833793 oppure su info@vitaedna.com"

💡 Esempi di domande che potresti ricevere:
- "Cosa contiene il test sport?"
- "Dove lo acquisto?"
- "Quanto ci mette ad arrivare?"
- "Posso ricevere supporto dopo?"

🛑 Non iniziare una nuova consulenza. Rispondi solo ai dubbi.

📚 Informazioni aggiuntive utili da sito e assistenza clienti:

- Il test genetico **VitaeDNA** è un dispositivo medico CE con tampone buccale autoessicante.
- Analizza geni legati a **metabolismo, alimentazione, intolleranze e sport**.
- Può identificare:
  - intolleranze (lattosio, glutine, istamina)
  - predisposizione al colon irritabile
  - fabbisogno vitaminico
  - invecchiamento precoce
  - sensibilità alle tossine
  - predisposizione genetica allo sport

- Sono disponibili 4 kit:
  - 🧬 **Kit Salute** → https://www.vitaedna.com/i-nostri-test/vitaedna-kit-salute/  
  - 🥗 **Kit Dimagrimento** → https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/  
  - 🏋️ **Kit Fitness** → https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/  
  - 🏃 **Kit Sport** → https://www.vitaedna.com/i-nostri-test/vitaedna-kit-sport/

- Referto via email in **max 3 settimane**. Include:
  - PDF con **genotipo, interpretazione e consigli**
  - link a **area personale con contenuti e follow-up**

- Il cliente può accedere alla propria area su:  
  🔗 https://www.vitaedna.com/my-account/

- Per ulteriori dubbi, indicare email **info@vitaedna.com** o telefono **0422 1833793**

- Tutti i dati sono **protetti secondo GDPR** e non condivisi con terze parti.

    Stile: professionale, rassicurante, mai aggressivo.
    `;


    const gptMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    const gptReply = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: gptMessages,
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        }
      }
    );

    const fullReply = gptReply.data.choices[0].message.content;
    const splitReplies = splitMessage(fullReply, 950);

    console.log("📤 Risposta AI suddivisa:", splitReplies);

    const updatedMessages = [
      ...userHistory.slice(-18),
      { role: 'user', content: userMessage },
      { role: 'assistant', content: fullReply }
    ];
    await saveHistory(userId, updatedMessages);

    res.status(200).json({ responses: splitReplies });

  } catch (error) {
    console.error('❌ Errore:', error.response?.data || error.message);
    res.status(500).json({ responses: ["Si è verificato un errore nel server."] });
  }
});

app.post('/vitdna-quiz', async (req, res) => {
  try {
    const { userId, nome, eta_utente, sesso, descrizione_fisico, obiettivo } = req.body;

    const prompt = `
L'utente ha completato un quiz per ricevere consigli personalizzati su:
- Alimentazione e integrazione
- Stile di vita
- Allenamento

Dati dell'utente:
- Nome: ${nome}
- Età: ${eta_utente}
- Sesso: ${sesso}
- Descrizione fisica: ${descrizione_fisico}
- Obiettivo: ${obiettivo}

Per ogni sezione, genera solo i suggerimenti personalizzati (massimo 500 caratteri per sezione), con tono semplice, professionale e amichevole.

Non scrivere introduzioni, né conclusioni. Non nominare il DNA o test genetici. Scrivi in italiano.

FORMATTO RICHIESTO:
[ALIMENTAZIONE]
[STILE DI VITA]
[ALLENAMENTO]
`;

    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        }
      }
    );

    const parts = gptResponse.data.choices[0].message.content.split("\n").filter(Boolean);
    const [alimentazioneGPT, stileGPT, allenamentoGPT] = parts;

    const section = staticSections[obiettivo] || {};
    const blocks = [
      `Ciao ${nome}, di seguito ti riportiamo una serie di consigli mirati per raggiungere il tuo obiettivo nel più breve tempo possibile:`,
      `- Alimentazione e integrazione:\n${alimentazioneGPT}\n\n${section.nutrition || ""}`,
      `- Stile di vita:\n${stileGPT}`,
      `- Allenamento:\n${allenamentoGPT}\n\n${section.training || ""}`,
      `${section.cta || ""}`,
      section.video ? `🎥 Video dedicato: ${section.video}` : "",
      `Per qualsiasi info puoi visitare il nostro sito https://www.vitaedna.com. E se hai qualsiasi dubbio o vuoi approfondire con un nostro esperto, chiama il +39 0422 1833793 per ricevere subito assistenza.`
    ].filter(Boolean);

    const messages = blocks.flatMap(splitMessage);

    return res.status(200).json({ responses: messages });
  } catch (error) {
    console.error("❌ Errore nella generazione personalizzata:", error.response?.data || error.message);
    res.status(500).json({ message: "Errore nella generazione della consulenza personalizzata." });
  }
});

const port = process.env.PORT || 3000;

// Connect to MongoDB then start the server
connectToMongo().then(() => {
  app.listen(port, () => console.log(`✅ Server AI avviato sulla porta ${port}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB, server not started:', err);
});

