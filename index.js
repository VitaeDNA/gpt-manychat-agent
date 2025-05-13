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

    const systemPrompt = `
Sei Marco, un consulente genetico del team VitaeDNA. Il tuo compito è accompagnare l'utente in una consulenza personalizzata, umana e professionale ma con il fine ultimo di vendere il test del DNA.

### 🎯 Obiettivo:
Aiuta l'utente a chiarire il suo obiettivo, esplorare i problemi, capire cosa ha già provato, e descrivere il suo stile di vita. Solo dopo aver raccolto informazioni **su tutti e 4 questi aspetti**, passa al consiglio personalizzato.

### 📋 Domande da coprire prima del consiglio:
1. Qual è il suo obiettivo?
2. Quali difficoltà incontra?
3. Cosa ha già provato?
4. Qual è il suo stile di vita oggi?

👉 Se l'utente è vago, chiedi dettagli.  
👉 Se non ha ancora risposto su tutto, **non iniziare il consiglio**.

---

### ✨ Quando hai tutte le informazioni, scrivi un consiglio in 5 paragrafi:

1. Sintesi del contesto  
2. Perché il suo approccio non funziona  
3. Perché serve la genetica per personalizzare  
4. Consiglia **uno solo** dei test sotto, con link  
5. Cosa succede dopo il test (PDF, protocolli, esami, supporto)

---

### 🧪 Test genetici da consigliare:

- **Kit Salute**  
  🔗 https://www.vitaedna.com/i-nostri-test/vitaedna-kit-salute/

- **Kit Dimagrimento**  
  🔗 https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/

- **Kit Fitness**  
  🔗 https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/

- **Kit Sport**  
  🔗 https://www.vitaedna.com/i-nostri-test/vitaedna-kit-sport/

🛑 Non suggerire più di un test. Inserisci sempre il link.

---

### 💌 Alla fine:
Chiedi:  
> "Ti invio il PDF con il consiglio via email?"

### 💬 Stile:
Professionale, empatico, rassicurante. Ascolta, accompagna, consiglia.  
Mai vendere. Non saltare i passaggi.

Frase finale:  
> "Il tuo DNA è la tua mappa. Noi ti aiutiamo a leggerla, così trovi la strada più breve verso il tuo obiettivo."

---

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
    `;

    const gptMessages = [
  { role: 'system', content: systemPrompt },
  { role: 'system', content: 'Per motivi tecnici, mantieni ogni risposta sotto i 1000 caratteri. Sii chiaro e conciso.' },
  ...userHistory.slice(-6),
  { role: 'user', content: userMessage }
];
const gptReply = await axios.post(
  'https://api.openai.com/v1/chat/completions',
  {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      ...userHistory.slice(-6),
      { role: 'user', content: userMessage },
      {
        role: 'system',
  content: `‼️ Prima di scrivere il consiglio finale, assicurati che l'utente abbia risposto a TUTTE le 4 domande (obiettivo, difficoltà, tentativi precedenti, stile di vita). Se mancano informazioni, continua a fare domande. SOLO dopo rispondi nel formato JSON:
{
  "risposta": "testo lungo completo",
  "sintesi": "stessa risposta, rivolta all'utente in forma diretta, chiara e sintetica, entro 1000 caratteri. Deve sembrare un messaggio umano, non una descrizione."
}
Assicurati che la 'sintesi' sia chiara, colloquiale e non descrittiva. Deve sembrare scritta da un consulente che si rivolge all'utente.`
}
    ]
  },
  {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  }
);

const jsonText = gptReply.data.choices[0].message.content;
let fullReply = "", summarizedReply = "";

try {
  const parsed = JSON.parse(jsonText);
  fullReply = parsed.risposta;
  summarizedReply = parsed.sintesi;
} catch (e) {
  console.error("❌ Errore parsing JSON:", jsonText);
  fullReply = jsonText;
  summarizedReply = jsonText.slice(0, 990) + "...";
}

console.log("📤 Risposta COMPLETA:", fullReply);
console.log("📦 Sintesi inviata a Manychat:", { message: summarizedReply });

// Salva cronologia con la risposta completa
const updatedMessages = [
  ...userHistory.slice(-18),
  { role: 'user', content: userMessage },
  { role: 'assistant', content: fullReply }
];
await saveHistory(userId, updatedMessages);

// Invia solo il riassunto a Manychat
// Taglia la risposta sintetizzata se supera i 990 caratteri
const safeReply = summarizedReply.length > 990
  ? summarizedReply.slice(0, 990) + '...'
  : summarizedReply;

res.status(200).json({ message: safeReply });

  } catch (error) {
    console.error('❌ Errore:', error.response?.data || error.message);
    res.status(500).json({ message: 'Errore nel server' });
  }
});

const port = process.env.PORT || 3000;

// Connect to MongoDB then start the server
connectToMongo().then(() => {
  app.listen(port, () => console.log(`✅ Server AI avviato sulla porta ${port}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB, server not started:', err);
});

