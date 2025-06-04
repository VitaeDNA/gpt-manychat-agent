const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();
let FAQ_TEXT = fs.readFileSync(path.join(__dirname, 'faqs.txt'), 'utf-8').trim();
let KITS_TEXT = fs.readFileSync(path.join(__dirname, 'kits.txt'), 'utf-8').trim();
const MAX_SECTION_CHARS = 10000;
if (FAQ_TEXT.length > MAX_SECTION_CHARS) {
  FAQ_TEXT = FAQ_TEXT.slice(0, MAX_SECTION_CHARS) + '\n[...domande addizionali rimosse per ragioni di spazio...]';
}
// ————————————————————————————————————————————————

const app = express();
app.use(bodyParser.json());
// Imposta un timeout di 9 secondi per tutte le risposte (Manychat timeout di default: 10s)
app.use((req, res, next) => {
  res.setTimeout(9000); // 9 secondi timeout
  next();
});
function splitMessage(text, maxLength = 980) {
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
// Aggiungi qui, prima degli handler:
function stripCtaLines(text) {
  return text
    .split('\n')
    .filter(line => !/(https?:\/\/|chiama|info@|\+39|Test Genetico)/i.test(line))
    .join('\n')
    .trim();
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
  "dimagrire": {
    nutrition: "La base di una dieta non è solo il numero di calorie assunte ma cercare di mantenere ormoni stabili e diminuire le infiammazioni. Quindi presta *attenzione ai cibi ad alto carico glicemico* e monitora la glicemia dopo i pasti principali, evita possibilmente i cibi che contengono grandi quantitativi di glutine e istamina che aumentano le infiammazioni. Cerca di assumere sempre le proteine nei vari pasti per mantenere la glicemia stabile. *Non esagerare con le fibre* che potrebbero creare infiammazioni intestinali e del colon. Cerca di limitare la caseina proteina contenuta nei latticini. Inoltre cerca di *evitare il lattosio* che la maggior parte della popolazione non produce l’enzima della lattasi.\n Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale.  Infatti attraverso l’analisi del tuo DNA ora potrai conoscere come funziona il tuo metabolismo e quindi come metabolizzi i grassi e i carboidrati, come gestisci gli indici glicemici, come individuare a quali cibi sei intollerante e moltissime altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te.",
    training: "Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza, l’individuale gestione dei carichi e volumi allenanti, come utilizziamo i grassi come fonte energetica e molte altre informazioni del nostro codice genetico cambiano completamente l’approccio all’allenamento e la possibilità di vedere dei miglioramenti individuando le tecniche di allenamento realmente *corrette per te e la tua genetica*.",
    cta: "Spesso sentiamo parlare che abbiamo una genetica sfavorevole e che per colpa di questa non possiamo raggiungere i nostri risultati. Invece le cose stanno esattamente nel verso opposto. È fondamentalmente conoscere il proprio DNA per individuare il percorso nutrizionale giusto per noi. Il nostro DNA, infatti, gioca un ruolo decisivo. Possiamo conoscere come funziona il nostro metabolismo e quindi come metabolizziamo i grassi e i carboidrati, come gestiamo gli indici glicemici, individuare a quali cibi siamo intolleranti, la nostra capacità antiossidante e altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te. E se stai seguendo una dieta o un piano di allenamento che non tiene conto di questi elementi, il rischio è che, anche facendo tutto “bene”, tu non ottenga risultati. Perché ricorda una dieta efficace non è solo questione di calorie. Infatti oggi, grazie alle ultime tecnologie di analisi genetica, possiamo scoprire il nostro DNA e orientare la persona verso scelte alimentari adatte al proprio profilo biologico. Per questo *abbiamo individuato il test genetico Dimagrimento o Fitness come ideali* per il tuo obiettivo:\n- *Test Genetico Dimagrimento* (Test genetico + Dieta personalizzata) - la miglior scelta per un servizio completo di nutrigenetica: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/\n- *Test Genetico Fitness* - la scelta giusta per una visione completa sulla tua salute, grazie a molte altre informazioni genetiche disponibili: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\n - Se hai dei dubbi o vuoi approfondire con un nostro esperto, chiama il +39 0422 1833793 per ricevere subito assistenza",
  },
 "risolvere infiammazione intestino": {
    nutrition: "La base di una dieta non è solo il numero di calorie assunte ma cercare di mantenere ormoni stabili e diminuire le infiammazioni. Quindi presta *attenzione ai cibi ad alto carico glicemico* e monitora la glicemia dopo i pasti principali, evita possibilmente i cibi che contengono grandi quantitativi di glutine e istamina che aumentano le infiammazioni. Cerca di assumere sempre le proteine nei vari pasti per mantenere la glicemia stabile. *Non esagerare con le fibre* che potrebbero creare infiammazioni intestinali e del colon. Cerca di limitare la caseina proteina contenuta nei latticini. Inoltre cerca di *evitare il lattosio* che la maggior parte della popolazione non produce l’enzima della lattasi.\n Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale.  Infatti attraverso l’analisi del tuo DNA ora potrai conoscere come funziona il tuo metabolismo e quindi come metabolizzi i grassi e i carboidrati, come gestisci gli indici glicemici, come individuare a quali cibi sei intollerante e moltissime altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te.",
    training: "Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza, l’individuale gestione dei carichi e volumi allenanti, come utilizziamo i grassi come fonte energetica e molte altre informazioni del nostro codice genetico cambiano completamente l’approccio all’allenamento e la possibilità di vedere dei miglioramenti individuando le tecniche di allenamento realmente *corrette per te e la tua genetica*.",
    cta: "Spesso sentiamo parlare che abbiamo una genetica sfavorevole e che per colpa di questa non possiamo raggiungere i nostri risultati. Invece le cose stanno esattamente nel verso opposto. È fondamentalmente conoscere il proprio DNA per individuare il percorso nutrizionale giusto per noi. Il nostro DNA, infatti, gioca un ruolo decisivo. Possiamo conoscere come funziona il nostro metabolismo e quindi come metabolizziamo i grassi e i carboidrati, come gestiamo gli indici glicemici, individuare a quali cibi siamo intolleranti, la nostra capacità antiossidante e altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te. E se stai seguendo una dieta o un piano di allenamento che non tiene conto di questi elementi, il rischio è che, anche facendo tutto “bene”, tu non ottenga risultati. Perché ricorda una dieta efficace non è solo questione di calorie. Infatti oggi, grazie alle ultime tecnologie di analisi genetica, possiamo scoprire il nostro DNA e orientare la persona verso scelte alimentari adatte al proprio profilo biologico. Per questo *abbiamo individuato il test genetico Dimagrimento o Fitness come ideali* per il tuo obiettivo:\n- *Test Genetico Dimagrimento* (Test genetico + Dieta personalizzata) - la miglior scelta per un servizio completo di nutrigenetica: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/\n- *Test Genetico Fitness* - la scelta giusta per una visione completa sulla tua salute, grazie a molte altre informazioni genetiche disponibili: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\n - Se hai dei dubbi o vuoi approfondire con un nostro esperto, chiama il +39 0422 1833793 per ricevere subito assistenza",
  },
   "risolvere problemi di gonfiore": {
    nutrition: "La base di una dieta non è solo il numero di calorie assunte ma cercare di mantenere ormoni stabili e diminuire le infiammazioni. Quindi presta *attenzione ai cibi ad alto carico glicemico* e monitora la glicemia dopo i pasti principali, evita possibilmente i cibi che contengono grandi quantitativi di glutine e istamina che aumentano le infiammazioni. Cerca di assumere sempre le proteine nei vari pasti per mantenere la glicemia stabile. *Non esagerare con le fibre* che potrebbero creare infiammazioni intestinali e del colon. Cerca di limitare la caseina proteina contenuta nei latticini. Inoltre cerca di *evitare il lattosio* che la maggior parte della popolazione non produce l’enzima della lattasi.\n Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale.  Infatti attraverso l’analisi del tuo DNA ora potrai conoscere come funziona il tuo metabolismo e quindi come metabolizzi i grassi e i carboidrati, come gestisci gli indici glicemici, come individuare a quali cibi sei intollerante e moltissime altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te.",
    training: "Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza, l’individuale gestione dei carichi e volumi allenanti, come utilizziamo i grassi come fonte energetica e molte altre informazioni del nostro codice genetico cambiano completamente l’approccio all’allenamento e la possibilità di vedere dei miglioramenti individuando le tecniche di allenamento realmente *corrette per te e la tua genetica*.",
    cta: "Spesso sentiamo parlare che abbiamo una genetica sfavorevole e che per colpa di questa non possiamo raggiungere i nostri risultati. Invece le cose stanno esattamente nel verso opposto. È fondamentalmente conoscere il proprio DNA per individuare il percorso nutrizionale giusto per noi. Il nostro DNA, infatti, gioca un ruolo decisivo. Possiamo conoscere come funziona il nostro metabolismo e quindi come metabolizziamo i grassi e i carboidrati, come gestiamo gli indici glicemici, individuare a quali cibi siamo intolleranti, la nostra capacità antiossidante e altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te. E se stai seguendo una dieta o un piano di allenamento che non tiene conto di questi elementi, il rischio è che, anche facendo tutto “bene”, tu non ottenga risultati. Perché ricorda una dieta efficace non è solo questione di calorie. Infatti oggi, grazie alle ultime tecnologie di analisi genetica, possiamo scoprire il nostro DNA e orientare la persona verso scelte alimentari adatte al proprio profilo biologico. Per questo *abbiamo individuato il test genetico Dimagrimento o Fitness come ideali* per il tuo obiettivo:\n- *Test Genetico Dimagrimento* (Test genetico + Dieta personalizzata) - la miglior scelta per un servizio completo di nutrigenetica: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-dimagrimento/\n- *Test Genetico Fitness* - la scelta giusta per una visione completa sulla tua salute, grazie a molte altre informazioni genetiche disponibili: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\n - Se hai dei dubbi o vuoi approfondire con un nostro esperto, chiama il +39 0422 1833793 per ricevere subito assistenza",
  },
 "aumentare muscoli": {
    nutrition: "La base di una dieta non è solo il numero di calorie assunte ma cercare di mantenere ormoni stabili e diminuire le infiammazioni. Quindi presta *attenzione ai cibi ad alto carico glicemico* e monitora la glicemia dopo i pasti principali, evita possibilmente i cibi che contengono grandi quantitativi di glutine e istamina che aumentano le infiammazioni. Cerca di assumere sempre le proteine nei vari pasti per mantenere la glicemia stabile. *Non esagerare con le fibre* che potrebbero creare infiammazioni intestinali e del colon. Cerca di limitare la caseina proteina contenuta nei latticini. Inoltre cerca di *evitare il lattosio* che la maggior parte della popolazione non produce l’enzima della lattasi.\n Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale.  Infatti attraverso l’analisi del tuo DNA ora potrai conoscere come funziona il tuo metabolismo e quindi come metabolizzi i grassi e i carboidrati, come gestisci gli indici glicemici, come individuare a quali cibi sei intollerante e moltissime altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te.",
    training: "Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza, l’individuale gestione dei carichi e volumi allenanti, come utilizziamo i grassi come fonte energetica e molte altre informazioni del nostro codice genetico cambiano completamente l’approccio all’allenamento e la possibilità di vedere dei miglioramenti individuando le tecniche di allenamento realmente *corrette per te e la tua genetica*.",
    cta: "Spesso sentiamo parlare che abbiamo una genetica sfavorevole e che per colpa di questa non possiamo raggiungere i nostri risultati. Invece le cose stanno esattamente nel verso opposto. È fondamentalmente conoscere il proprio DNA per individuare il percorso nutrizionale giusto per noi. Il nostro DNA, infatti, gioca un ruolo decisivo. Possiamo conoscere come funziona il nostro metabolismo e quindi come metabolizziamo i grassi e i carboidrati, come gestiamo gli indici glicemici, individuare a quali cibi siamo intolleranti, la nostra capacità antiossidante. Per l’allenamento possiamo conoscere se abbiamo geni di forza o di resistenza, I volumi allenanti che possiamo gestire, i tempi di recupero e altre informazioni fondamentali per costruire un protocollo nutrizionale e di allenamento realmente funzionale per te. E se stai seguendo una dieta o un piano di allenamento che non tiene conto di questi elementi, il rischio è che, anche facendo tutto “bene”, tu non ottenga risultati. Perché ricorda una dieta efficace non è solo questione di calorie. Infatti oggi, grazie alle ultime tecnologie di analisi genetica, possiamo scoprire il nostro DNA e orientare la persona verso scelte alimentari adatte al proprio profilo biologico. Per questo *abbiamo individuato il test genetico Sport o Fitness come ideali* per il tuo obiettivo:*\n- *Test Genetico Sport* (Test genetico + Dieta Personalizzata + Scheda Allenamento) - la miglior scelta per un servizio completo di nutrigenetica e sport: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-sport/\n- *Test Genetico Fitness* - la scelta giusta per una visione completa sulla tua salute, grazie a molte altre informazioni genetiche disponibili: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\n -Se hai dei dubbi o vuoi approfondire con un nostro esperto, chiama il +39 0422 1833793 per ricevere subito assistenza",
  },
   "prevenire": {
    nutrition: "La base di una dieta non è solo il numero di calorie assunte ma cercare di mantenere ormoni stabili e diminuire le infiammazioni. Quindi presta *attenzione ai cibi ad alto carico glicemico* e monitora la glicemia dopo i pasti principali, evita possibilmente i cibi che contengono grandi quantitativi di glutine e istamina che aumentano le infiammazioni. Cerca di assumere sempre le proteine nei vari pasti per mantenere la glicemia stabile. *Non esagerare con le fibre* che potrebbero creare infiammazioni intestinali e del colon. Cerca di limitare la caseina proteina contenuta nei latticini. Inoltre cerca di *evitare il lattosio* che la maggior parte della popolazione non produce l’enzima della lattasi.\n Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale.  Infatti attraverso l’analisi del tuo DNA ora potrai conoscere come funziona il tuo metabolismo e quindi come metabolizzi i grassi e i carboidrati, come gestisci gli indici glicemici, come individuare a quali cibi sei intollerante e moltissime altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te.",
    training: "Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza, l’individuale gestione dei carichi e volumi allenanti, come utilizziamo i grassi come fonte energetica e molte altre informazioni del nostro codice genetico cambiano completamente l’approccio all’allenamento e la possibilità di vedere dei miglioramenti individuando le tecniche di allenamento realmente *corrette per te e la tua genetica*.",
    cta: "Oggi, grazie alle ultime tecnologie, abbiamo la possibilità di analizzare il nostro patrimonio genetico per capire se siamo predisposti a sviluppare alcune patologie croniche, come diabete, ipertensione, rischio cardiovascolare,  malattie infiammatorie e molto altro. Possiamo sapere in anticipo come il nostro corpo gestisce lo stress ossidativo, se è efficiente nell’assorbire determinati nutrienti, se tende a infiammarsi più facilmente. E avere queste informazioni ora, prima che insorgano i sintomi o le malattie, è fondamentale per effettuare dei controlli mirati attraverso gli esami del sangue e per attuare dei protocolli nutrizionali, nutraceutici, stile di vita e farmaceutici diretti a prevenire il rischio dello sviluppo delle patologie a cui si è predisposti. Se vuoi scoprire come conoscere la tua genetica in modo molto semplice e i rischi ad alcune patologie a cui sei predisposto premi questo link. Conoscere il tuo DNA ti permetterà di agire preventivamente ed evitare di incorrere nelle patologie a cui sei predisposto. Per questo *abbiamo individuato il test genetico Salute o Fitness come ideali* per il tuo obiettivo:\n- *Test Genetico Salute* - la miglior scelta per la prevenzione della tua salute: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-salute/.\n- *Test Genetico Fitness* - la scelta giusta per una visione completa sulla tua salute, grazie a molte altre informazioni genetiche disponibili: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\n - Se hai dei dubbi o vuoi approfondire con un nostro esperto, chiama il +39 0422 1833793 per ricevere subito assistenza",
  },
   "risolvere altri problemi": {
    nutrition: "La base di una dieta non è solo il numero di calorie assunte ma cercare di mantenere ormoni stabili e diminuire le infiammazioni. Quindi presta *attenzione ai cibi ad alto carico glicemico* e monitora la glicemia dopo i pasti principali, evita possibilmente i cibi che contengono grandi quantitativi di glutine e istamina che aumentano le infiammazioni. Cerca di assumere sempre le proteine nei vari pasti per mantenere la glicemia stabile. *Non esagerare con le fibre* che potrebbero creare infiammazioni intestinali e del colon. Cerca di limitare la caseina proteina contenuta nei latticini. Inoltre cerca di *evitare il lattosio* che la maggior parte della popolazione non produce l’enzima della lattasi.\n Però per individuare il percorso nutrizionale giusto per te la tua genetica gioca un ruolo fondamentale.  Infatti attraverso l’analisi del tuo DNA ora potrai conoscere come funziona il tuo metabolismo e quindi come metabolizzi i grassi e i carboidrati, come gestisci gli indici glicemici, come individuare a quali cibi sei intollerante e moltissime altre informazioni fondamentali per costruire un protocollo nutrizionale realmente funzionale per te.",
    training: "Attraverso l’analisi del tuo DNA è ora possibile sapere se abbiamo geni di forza o di resistenza, l’individuale gestione dei carichi e volumi allenanti, come utilizziamo i grassi come fonte energetica e molte altre informazioni del nostro codice genetico cambiano completamente l’approccio all’allenamento e la possibilità di vedere dei miglioramenti individuando le tecniche di allenamento realmente *corrette per te e la tua genetica*.",
    cta: "Oggi, grazie alle ultime tecnologie, abbiamo la possibilità di analizzare il nostro patrimonio genetico per capire se siamo predisposti a sviluppare alcune patologie croniche, come diabete, ipertensione, rischio cardiovascolare,  malattie infiammatorie e molto altro. Possiamo sapere in anticipo come il nostro corpo gestisce lo stress ossidativo, se è efficiente nell’assorbire determinati nutrienti, se tende a infiammarsi più facilmente. E avere queste informazioni ora, prima che insorgano i sintomi o le malattie, è fondamentale per effettuare dei controlli mirati attraverso gli esami del sangue e per attuare dei protocolli nutrizionali, nutraceutici, stile di vita e farmaceutici diretti a prevenire il rischio dello sviluppo delle patologie a cui si è predisposti. Se vuoi scoprire come conoscere la tua genetica in modo molto semplice e i rischi ad alcune patologie a cui sei predisposto premi questo link. Conoscere il tuo DNA ti permetterà di agire preventivamente ed evitare di incorrere nelle patologie a cui sei predisposto. Per questo *abbiamo individuato il test genetico Salute o Fitness come ideali* per il tuo obiettivo:\n- *Test Genetico Salute* - la miglior scelta per la prevenzione della tua salute: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-salute/.\n- *Test Genetico Fitness* - la scelta giusta per una visione completa sulla tua salute, grazie a molte altre informazioni genetiche disponibili: https://www.vitaedna.com/i-nostri-test/vitaedna-kit-fitness/\n - Se hai dei dubbi o vuoi approfondire con un nostro esperto, chiama il +39 0422 1833793 per ricevere subito assistenza",
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
Sei Marco, assistente genetico AI di VitaeDNA. Il tuo compito è rispondere alle domande degli utenti usando le informazioni presenti nel blocco FAQ (${FAQ_TEXT}) qui sotto.  

1. Prima di rispondere, individua quale sezione delle FAQ tratta l’argomento (anche se la domanda è formulata in modo diverso).  
2. Usa i fatti e i numeri esatti presenti nella FAQ. Puoi parafrasare leggermente per chiarezza, ma NON cambiare le informazioni fondamentali (per esempio non dire “2 settimane” se la FAQ dice “3–4 settimane”).  
3. Se la domanda riguarda un argomento non presente nelle FAQ, puoi rispondere brevemente con le informazioni pubbliche e CONCLUDERE consigliando di contattare il nostro team (numero, sito, email).  
4. Non inventare altri dettagli, non uscire dal contesto, non consigliare un test che non sia già nelle FAQ.

### ESEMPI

**Esempio 1**  
- Utente: “Quanto tempo ci mettete ad agosto per consegnare i risultati?”  
- Risposta corretta: “A luglio/la FAQ riporta che in **Agosto** i tempi di consegna sono di 3–4 settimane (laboratorio chiuso a metà agosto; analisi riprendono a settembre).”  

**Esempio 2**  
- Utente: “Come si svolge il Kit Dimagrimento di VitaeDNA? Che informazioni fornisce?”  
- Risposta corretta: “Il Kit Dimagrimento di VitaeDNA offre analisi genetiche avanzate per creare una dieta personalizzata in base al tuo patrimonio genetico e alle preferenze alimentari. È pensato per migliorare la salute generale, aiutarti a raggiungere il peso forma e fornisce indicazioni su intolleranze alimentari, cibi consigliati, metabolismo, sport e allenamento. Se vuoi ordinarlo, visita www.vitaedna.com/prodotto/vitaedna-kit-dimagrimento/ o contatta il team al +39 0422 1833793.”  

**Esempio 3**  
- Utente: “Il test genetico è detraibile dalle tasse?”  
- Risposta corretta: “Sì. Secondo la FAQ, il test genetico è detraibile come spesa sanitaria se eseguito in strutture accreditate; conserva fattura e referto per l’Agenzia delle Entrate. Se hai dubbi, chiama +39 0422 1833793.”  

--- FAQ PRINCIPALI ---  
${FAQ_TEXT}

‼️ Non consigliare un test diverso.
✅ Se l’utente chiede chiarimenti, fai riferimento al test già consigliato.
📌 Questo è il consiglio che hai dato prima: ${lastAssistantReply?.content || "Nessun consiglio disponibile."}

Stile: professionale, rassicurante, mai aggressivo.
`;

    const gptMessages = [
      { role: 'system', content: systemPrompt },
      ...userHistory.slice(-6),  // Include last 6 messages from history
      { role: 'user', content: userMessage }
    ];

  const gptReply = await axios.post(
  'https://api.openai.com/v1/chat/completions',
  {
    model: "gpt-3.5-turbo",
    messages: gptMessages,  // Use the properly defined gptMessages array
    temperature: 0.0,
    max_tokens: 800
  },
  {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    }
  }
);

    // 1. prendi la risposta completa
const fullReply = gptReply.data.choices[0].message.content;

// 2. se è troppo lunga (>1000), richiedi a GPT una sintesi
let finalReply = fullReply;
if (fullReply.length > 1000) {
  console.log(`⚠️ Risposta troppo lunga (${fullReply.length} chars), genero una sintesi…`);
  const summaryResponse = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Sei un assistente che sintetizza testi mantenendo i punti chiave in massimo 1000 caratteri.'
        },
        {
          role: 'user',
          content: `Per favore, sintetizza questo testo in non più di 1000 caratteri:\n\n${fullReply}`
        }
      ],
      temperature: 0.0
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      }
    }
  );
  finalReply = summaryResponse.data.choices[0].message.content.trim();
  console.log('📋 Sintesi generata:', finalReply.length, 'caratteri');
}

// 3. suddividi in chunk da inviare a Manychat
const splitReplies = splitMessage(finalReply, 999);
console.log("📤 Risposta AI suddivisa:", splitReplies);

// 4. salva la history con il contesto + utente + risposta completa
const updatedMessages = [
  // se usavi slice sui 18 messaggi precedenti:
  ...userHistory.slice(-18),
  { role: 'user', content: userMessage },
  { role: 'assistant', content: fullReply }
];
await saveHistory(userId, updatedMessages);

// 5. restituisci a Manychat
res.status(200).json({ responses: splitReplies });


  } catch (error) {
    console.error('❌ Errore:', error.response?.data || error.message);
    res.status(500).json({ responses: ["Si è verificato un errore nel server."] });
  }
});

app.post('/vitdna-quiz', async (req, res) => {
  console.log('▶️ /vitdna-quiz body:', JSON.stringify(req.body));
  try {
    const {
      user_id: userId,
      nome, eta_utente, sesso, descrizione_fisico, obiettivo,
      q6_dieta, q7_macronutrienti, q8_allenamento, q9_medicine, q10_patologia, numero
    } = req.body;

    const history = await loadHistory(userId);
// Se esiste quizLockExpiresAt e non è scaduto, blocca:
if (history.quizInEsecuzione && history.quizLockExpiresAt > new Date()) {
  console.log('⚠️ Quiz già in corso per user', userId, ', ignoro la seconda invocazione.');
  return res.status(200).json({});
}
await db.collection(collectionName).updateOne(
  { userId },
  { $set: { quizInEsecuzione: false }, $unset: { quizLockExpiresAt: "" } }
);
);

    // 1) mettiamo tutte le risposte utente in un blocco chiaro
    const userInfo = `
Nome: ${nome}
Età: ${eta_utente}
Sesso: ${sesso}
Descrizione fisico: ${descrizione_fisico}
Obiettivo: ${obiettivo}
Ha già seguito diete: ${q6_dieta}
Macronutrienti medi: ${q7_macronutrienti}
Ore di allenamento/sett.: ${q8_allenamento}
Farmaci/Integratori: ${q9_medicine || 'nessuno'}
Patologia diagnosticata: ${q10_patologia || 'nessuna'}
numero telefono: ${numero}
`.trim();

    // 2) definiamo chatMessages per OpenAI
    const chatMessages = [
      {
        role: 'system',
            content: `Sei un nutrizionista e coach sportivo. Hai davanti i seguenti dati dell’utente:
${userInfo}

Sulla base di *ciascuna* informazione, genera **solo** quattro sezioni:
[ALIMENTAZIONE]  
• 2–3 cibi o mini-pasti concreti.  
• Rapida modifica dei macronutrienti se serve (es. “aumenta proteine a 2 g/kg”).
• Suggerisci di prediligere cibi specifici come: avocado, frutta secca, tuorlo d’uovo, olio d’oliva e simili.
• Suggerisci come carboidrati di prediligere farro, grano saraceno, riso basmati riso rosso, riso paraboild, riso Venere.
• Suggerisci come proteine: pesce bianco, carne rossa, carne bianca e albume d’uovo.
• Non consigliare MAI il latte.

[INTEGRAZIONE]  
• 5–6 integratori o nutrienti specifici (dosaggi, tempi di assunzione) adatti al profilo e all’obiettivo.
• Gli integratori o nutrienti che consigli devono essere estremamente specifici, come ad esempio: astaxantina, vitamina c liposomiale, glutatione liposomiale, acido alfa lipoico, Zinco, omega 3.
• Gli integratori o nutrienti che consigli devono essere innovativi e per lo piú poco conosciuti.
• Negli integratori o nutrienti che consigli devono esserci degli antiossidanti.

[STILE DI VITA]  
• 2–3 azioni quotidiane pratiche (es. sonno, idratazione, recupero, gestione stress).

[ALLENAMENTO]  
• 2–3 esercizi o mini-programma (es. frequenza, durata, intensità) perfetti per età, livello e obiettivo.

**REGOLE**:
- NON troncare con “…”.
- NON includere **in alcun modo** referenze a test genetici, call-to-action, link o inviti all’acquisto.
– Massimo 900 caratteri per sezione.
– Tutte le sezioni devono essere riportate nel modo richiesto senza saltare nulla.
– Usa TUTTE le informazioni che l'utente ha fornito ${userInfo} per creare consigli personale e creati apposta per lui, non essere vago.
– Usa un tono semplice, professionale e amichevole.
– NON essere vago: usa nomi di alimenti, numeri, tempi.  
– NON nominare DNA o test genetici.
– NON scrivere introduzioni né conclusioni.
– Scrivi in italiano.`
      },
      {
        role: 'user',
        content: `
Formato di uscita **esatto** (includi le etichette):
[ALIMENTAZIONE]
[INTEGRAZIONE]
[STILE DI VITA]
[ALLENAMENTO]`
      }
    ];

    // 3) chiamata a OpenAI
    const gptReply = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: chatMessages,
        temperature: 0,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    const text = gptReply.data.choices[0].message.content;

    // 4) estrazione via regex
    const mA = text.match(/\[ALIMENTAZIONE\]\s*([\s\S]*?)\s*(?=\[INTEGRAZIONE\])/i);
    const mI = text.match(/\[INTEGRAZIONE\]\s*([\s\S]*?)\s*(?=\[STILE DI VITA\])/i);
    const mS = text.match(/\[STILE DI VITA\]\s*([\s\S]*?)\s*(?=\[ALLENAMENTO\])/i);
    const mL = text.match(/\[ALLENAMENTO\]\s*([\s\S]*)/i);
    if (!mA || !mS || !mL) throw new Error('Formato risposta AI non valido');

let alimentazioneGPT = stripCtaLines(mA[1]);
let integrazioneGPT  = mI[1].trim();
let stileGPT        = stripCtaLines(mS[1]);
let allenamentoGPT  = stripCtaLines(mL[1]);

    // 5) recuperiamo la sezione statica
    const key     = obiettivo.toLowerCase();
    const section = staticSections[key] || {};

    // 6) costruzione del testo completo (inclusa la cta una sola volta)
    const fullAdvice = `
*Alimentazione*:
${alimentazioneGPT}

${section.nutrition || ''}

*Integrazione*:
${integrazioneGPT}

*Stile di vita*:
${stileGPT}

*Allenamento*:
${allenamentoGPT}

${section.training || ''}

${section.cta || ''}
`.trim();

    // 7) split in chunk da inviare a ManyChat
    const chunks = splitMessage(fullAdvice);

// 8) prepara il payload includendo fino a response_5 (placeholder se necessario)
const responsePayload = {};
for (let i = 0; i <= 5; i++) {
  responsePayload[`response_${i}`] = (chunks[i] && chunks[i].trim().length > 0)
    ? chunks[i]
    : "";  // placeholder non‐vuoto
}

    // 9) salva in history
    const userHistory = (await loadHistory(userId)).messages || [];
    await saveHistory(userId, [
      ...userHistory,
      { role: 'user', content: `[QUIZ COMPLETATO] Obiettivo: ${obiettivo}` },
      { role: 'assistant', content: fullAdvice }
    ]);
     // 9b) aggiorna il documento in MongoDB aggiungendo "numero" appena estratto
     await db.collection(collectionName).updateOne(
     { userId: userId },
     { $set: { numero: numero } },
      { upsert: true }
 );
    // … logica che genera fullAdvice, chunks, salva in history, ecc. …
await db.collection(collectionName).updateOne(
  { userId },
  { $set: { quizInEsecuzione: false } }
);
    // 10) restituisci la risposta
    return res.json(responsePayload);

  } catch (err) {
    console.error('❌ Errore nella generazione personalizzata:', err.response?.data || err);
    // In caso di errore, resetta il flag per non bloccare l’utente
    if (req.body.user_id) {
      await db.collection(collectionName).updateOne(
        { userId: req.body.user_id },
        { $set: { quizInEsecuzione: false } }
      );
    }
    return res.status(500).json({ message: 'Errore nella generazione della consulenza personalizzata.' });
  }
});

const port = process.env.PORT || 3000;

// Connect to MongoDB then start the server
connectToMongo().then(() => {
  app.listen(port, () => console.log(`✅ Server AI avviato sulla porta ${port}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB, server not started:', err);
});

