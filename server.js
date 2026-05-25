const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs-extra');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
// Разрешаем серверу отдавать все файлы (html, json, js иконки) из корня
app.use(express.static(__dirname));

const DB_FILE = './db.json';
const GEMINI_KEY = 'AIzaSyA5qAs-al3dc9tNdzNEQ0QkU-Cdn7FFqDw';
const ADMIN_PASS = 'kristi_admin_2026'; 

// Инициализация базы данных при первом запуске
if (!fs.existsSync(DB_FILE)) {
    fs.writeJsonSync(DB_FILE, { 
        users: [], 
        stats: { total_earned: 0, plus_count: 0, ultra_count: 0, total_users: 0 } 
    });
}

const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'codes.kristi.ai@gmail.com', pass: 'vdzi nsih sojk wiqj' }
});

const getDB = () => fs.readJsonSync(DB_FILE);
const saveDB = (data) => fs.writeJsonSync(DB_FILE, data);

// --- API АВТОРИЗАЦИИ ---
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000);
    const html = `
        <div style="background:#0d0e12;color:#fff;padding:30px;text-align:center;font-family:sans-serif;">
            <h1 style="color:#ff6b6b;">Kristi AI</h1>
            <p>Ваш код подтверждения:</p>
            <div style="font-size:32px; font-weight:bold; letter-spacing:5px; margin:20px 0;">${code}</div>
        </div>`;
    try {
        await mailer.sendMail({ from: '"Kristi AI"', to: email, subject: 'Код активации Kristi', html });
        res.json({ success: true, code }); 
    } catch (e) { res.status(500).json({ error: 'Ошибка почты' }); }
});

app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    const db = getDB();
    let user = db.users.find(u => u.email === email);
    
    if (!user) {
        user = { 
            email, 
            password, 
            username: email.split('@')[0], 
            plan: 'Free', 
            requests: 0, 
            limit: 100, 
            voice: 'Kristi' 
        };
        db.users.push(user);
        db.stats.total_users++;
        saveDB(db);
    } else {
        // Если юзер есть, проверяем пароль
        if (user.password !== password) return res.status(401).json({ error: 'Wrong password' });
    }
    res.json({ success: true, user });
});

// --- API ЧАТА ---
app.post('/api/chat', async (req, res) => {
    const { email, prompt, mode } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.email === email);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Проверка лимитов (Ultra — безлимит)
    if (user.plan !== 'Ultra' && user.requests >= user.limit) {
        return res.json({ error: 'Лимит исчерпан. Перейдите на Plus или Ultra.' });
    }

    let systemInstruction = "Ты — Kristi, умный и мотивирующий ассистент.";
    if(mode === 'Fast') systemInstruction += " Отвечай максимально кратко.";
    if(mode === 'Pro') systemInstruction += " Давай глубокий, экспертный и детальный ответ.";

    try {
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
            contents: [{ parts: [{ text: `${systemInstruction}\n\nПользователь: ${prompt}` }] }]
        });
        
        user.requests++;
        saveDB(db);
        res.json({ answer: response.data.candidates[0].content.parts[0].text });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка ИИ. Проверьте API ключ.' });
    }
});

// --- API АДМИН-ПАНЕЛИ ---
app.post('/api/admin/data', (req, res) => {
    if (req.body.password !== ADMIN_PASS) return res.status(403).json({ error: 'Доступ запрещен' });
    res.json(getDB());
});

app.post('/api/admin/give-plan', (req, res) => {
    const { password, email, plan } = req.body;
    if (password !== ADMIN_PASS) return res.status(403).json({ error: 'Доступ запрещен' });

    const db = getDB();
    const user = db.users.find(u => u.email === email);
    
    if (user) {
        user.plan = plan;
        if (plan === 'Plus') {
            user.limit = 200;
            db.stats.plus_count++;
        } else if (plan === 'Ultra') {
            user.limit = 999999;
            db.stats.ultra_count++;
        } else {
            user.limit = 100;
        }
        saveDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Пользователь не найден' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server LIVE on port ${PORT}`));
