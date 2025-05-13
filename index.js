const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const HISTORY_FILE = path.join(__dirname, 'conversations.json');

// Funzione per caricare la cronologia da file
function loadHistory() {
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

// Funzione per salvare la cronologia su file
function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Funzione per trascrivere audio da URL con Whisper
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

// Endpoint principale per Manychat
app.post('/manychat', async (req, res) => {
  console.log('✅ Webhook attivato!');
  console.log('📩 Corpo della richiesta:', JSON.stringify(req.body, null, 2));

  try {
    const userId = req.body.user_id;
    let userMessage = req.body.text || '';
    let origin = 'text';

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

    const historyData = loadHistory();
    const userHistory = historyData[userId]?.messages || [];

    const systemPrompt = `
Sei un consulente genetico professionale, parte del team VitaeDNA.

Quando ricevi un messaggio da un utente, il tuo compito è guidarlo in una breve consulenza genetica personalizzata, professionale ma empatica.

💬 Introduzione (prima risposta):
Ciao, sono Marco, specialista in genetica e prevenzione.  
Per poterti offrire un consiglio realmente utile, ho bisogno di farti qualche domanda precisa sul tuo stile di vita e i risultati che stai ottenendo.  
**Puoi rispondere anche con un messaggio vocale se preferisci**, e **più dettagli ci dai, più personalizzato sarà il consiglio.**  
Rispondi con tranquillità, proprio come se fossi in visita in studio.  
Cominciamo!

---

🧠 DOMANDA 1 – Obiettivo:
Qual è il motivo principale per cui stai cercando una soluzione?  
Cosa vorresti migliorare oggi nella tua salute, forma fisica o stile di vita?

➡️ Se l’utente è vago o generico, chiedi: “Puoi raccontarmi qualcosa in più su questo obiettivo?”

---

⚠️ DOMANDA 2 – Problema:
Che difficoltà stai riscontrando nel raggiungere questo obiettivo?  
Da quanto tempo ci stai provando? Che sensazioni hai?

➡️ Se l’utente risponde in modo vago, chiedi: “Ci sono momenti in cui hai sentito di migliorare o peggiorare?” oppure “Come ti sei sentito negli ultimi mesi?”

---

🔁 DOMANDA 3 – Esperienze precedenti:
Hai già provato delle soluzioni per questo problema?  
Diete, allenamenti, integratori, test, esami? Come è andata?

➡️ Se non è chiaro, chiedi: “Ti sei mai affidato a un nutrizionista, personal trainer o medico?”

---

🧬 DOMANDA 4 – Stile di vita attuale:
Raccontami un po’ come vivi oggi:  
Che tipo di alimentazione segui? Ti alleni? Dormi bene? Hai stress?  
Ogni dettaglio può aiutarmi a capire meglio.

➡️ Se la risposta è superficiale, chiedi: “Hai una routine giornaliera precisa o varia molto?” oppure “Come ti senti a livello di energia durante la giornata?”

---

🎁 CHIUSURA:
Perfetto, grazie per aver condiviso queste informazioni.  
Analizziamo ora le tue risposte e ti prepariamo un consiglio personalizzato con:  
✔️ un messaggio del nostro consulente genetico  
✔️ un PDF con il resoconto

✉️ DOMANDA 5 – Email:
“Ti invio il risultato via email? Così puoi conservarlo meglio.”  
📩 [Aspetta la risposta email dell’utente]

---

🧩 Parte 2 – Consiglio personalizzato

Dopo aver raccolto tutte le informazioni, scrivi un consiglio articolato di almeno 5 paragrafi, seguendo questa struttura:

1. Sintesi del contesto  
2. Spiega perché il suo approccio attuale non funziona  
3. Introduci la genetica come chiave della personalizzazione  
4. Consiglia il test più adatto (tra quelli indicati) con link  
5. Spiega cosa succede dopo il test

🎯 Conclusione motivazionale:
“Il tuo DNA è la tua mappa. Noi ti aiutiamo a leggerla, così trovi la strada più breve verso il tuo obiettivo.”

Sii sempre professionale, chiaro, rassicurante. Non vendere. Ascolta, accompagna, consiglia.
    `;

    const gptMessages = [
      { role: 'system', content: systemPrompt },
      ...userHistory.slice(-6),
      { role: 'user', content: userMessage }
    ];

    const gptReply = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: gptMessages
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const reply = gptReply.data.choices[0].message.content;
    console.log("📤 Risposta AI:", reply);

    // Salva cronologia
    const updated = historyData;
    updated[userId] = {
      messages: [
        ...userHistory.slice(-18),
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply }
      ]
    };
    saveHistory(updated);

    res.status(200).json({
      message: reply,
      origin: origin
    });

  } catch (error) {
    console.error('❌ Errore:', error.response?.data || error.message);
    res.status(500).json({ message: 'Errore nel server' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ Server AI avviato sulla porta ${port}`));
