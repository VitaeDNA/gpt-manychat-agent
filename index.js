const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

app.post('/manychat', async (req, res) => {
  try {
    const userMessage = req.body.text || '';
    const userId = req.body.user_id;

    // Chiamata a GPT-4
    const gptReply = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const reply = gptReply.data.choices[0].message.content;

    // Invia risposta a Manychat
    await axios.post(
      `https://api.manychat.com/fb/sending/sendContent`,
      {
        subscriber_id: userId,
        messages: [{ type: 'text', text: reply }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MANYCHAT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Errore nel server');
  }
});

app.listen(3000, () => console.log('✅ Server AI avviato sulla porta 3000'));
