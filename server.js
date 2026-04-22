require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();

app.get('/', (req, res) => res.send('alive'));

app.get('/db', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    res.send('db ok');
  } catch (e) {
    res.status(500).send('db fail: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`up on ${PORT}`));