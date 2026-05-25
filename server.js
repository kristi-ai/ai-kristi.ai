const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs-extra');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const DB_FILE = './db.json';
const GEMINI_KEY = 'AIzaSyA5qAs-al3dc9tNdzNEQ0QkU-Cdn7FFqDw';
const ADMIN_PASS = 'kristi_admin_2026'; 

// Проверка наличия БД перед стартом
if (!fs.existsSync(DB_FILE)) {
    fs.writeJsonSync(DB_FILE, { users: [], stats: { total_earned: 0, plus_count: 0, ultra_count: 0, total_users: 0 } });
}

const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'codes.kristi.ai@gmail.com', pass: 'vdzi nsih sojk wiqj' }
});

const getDB = () => fs.readJsonSync(DB_FILE);
const saveDB = (data) => fs.writeJsonSync(DB_FILE, data);

app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000);
    const html = `<div style="background:#0d0e12;color:#fff;padding:20px;text-align:center;"><h1>Kristi AI</h1><p>Code: <b>${code}</b></p></div>`;
    try {
        await mailer.sendMail({ from: '"Kristi AI"', to: email, subject: 'Verification', html });
        res.json({ success: true, code }); 
    } catch (e) { res.status(500).json({ error: 'Mail error' }); }
});

app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    const db = getDB();
    let user = db.users.find(u => u.email === email);
    if (!user) {
        user = { email, password, username: email.split('@')[0], plan: 'Free', requests: 0, limit: 100, voice: 'Kristi' };
        db.users.push(user);
        db.stats.total_users++;
        saveDB(db);
    }
    res.json({ success: true, user });
});

app.post('/api/chat', async (req, res) => {
    const { email, prompt, mode } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.email === email);
    if (!user || (user.requests >= user.limit && user.plan !== 'Ultra')) return res.json({ error: 'Limit reached' });

    let inst = "Short.";
    if(mode === 'Ultra') inst = "Structured.";
    if(mode === 'Pro') inst = "Detailed expert.";

    try {
        const resp = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
            contents: [{ parts: [{ text: `${inst}\n${prompt}` }] }]
        });
        user.requests++;
        saveDB(db);
        res.json({ answer: resp.data.candidates[0].content.parts[0].text });
    } catch (e) { res.status(500).json({ error: 'AI Error' }); }
});

app.post('/api/admin/data', (req, res) => {
    if (req.body.password !== ADMIN_PASS) return res.status(403).send('No');
    res.json(getDB());
});

// Слушаем порт, который выдаст Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
