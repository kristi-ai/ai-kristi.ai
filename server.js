const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const cors = require('cors');
const path = require('path');

const app = express();
// Увеличиваем лимит для передачи аватарок и фото (base64)
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(__dirname));

const DB_FILE = './db.json';
const GEMINI_KEY = 'AIzaSyA5qAs-al3dc9tNdzNEQ0QkU-Cdn7FFqDw';
const ADMIN_PASS = 'kristi_admin_2026';

if (!fs.existsSync(DB_FILE)) {
    fs.writeJsonSync(DB_FILE, { users: [], stats: { total_earned: 0, plus_count: 0, ultra_count: 0, total_users: 0 } });
}

const getDB = () => fs.readJsonSync(DB_FILE);
const saveDB = (data) => fs.writeJsonSync(DB_FILE, data);

// --- 1. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ (USERNAME) ---
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });

    const db = getDB();
    let user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
        // Регистрация нового пользователя
        const newId = 'ID-' + Math.floor(100000 + Math.random() * 900000);
        user = {
            id: newId,
            username,
            password,
            plan: 'Free',
            requests: 0,
            limit: 100,
            avatar: null,
            chat_history: []
        };
        db.users.push(user);
        db.stats.total_users++;
        saveDB(db);
        return res.json({ success: true, user, isNew: true });
    }

    // Вход существующего пользователя
    if (user.password !== password) return res.status(401).json({ error: 'Неверный пароль' });
    res.json({ success: true, user, isNew: false });
});

// --- 2. ПРОФИЛЬ (СМЕНА ПАРОЛЯ И АВАТАРА) ---
app.post('/api/profile/update', (req, res) => {
    const { username, oldPassword, newPassword, avatar } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.username === username);

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (newPassword) {
        if (user.password !== oldPassword) return res.status(401).json({ error: 'Неверный старый пароль' });
        user.password = newPassword;
    }
    
    if (avatar) user.avatar = avatar;

    saveDB(db);
    res.json({ success: true, user });
});

// --- 3. ИИ ЧАТ (ИСТОРИЯ + GEMINI) ---
app.post('/api/chat', async (req, res) => {
    const { username, prompt, mode, imageBase64 } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.username === username);

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.plan !== 'Ultra' && user.requests >= user.limit) return res.json({ error: 'Лимит исчерпан. Оформите тариф Plus или Ultra.' });

    let sysInstr = "Ты Kristi, мотивирующий ИИ ассистент.";
    if (mode === 'Fast') sysInstr += " Отвечай максимально коротко.";
    if (mode === 'Pro') sysInstr += " Отвечай как эксперт, давай глубокий аналитический разбор.";

    let parts = [{ text: `${sysInstr}\n\nПользователь: ${prompt}` }];
    
    // Если пользователь прикрепил картинку
    if (imageBase64) {
        const base64Data = imageBase64.split(',')[1];
        const mimeType = imageBase64.match(/data:(.*?);base64/)[1];
        parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
    }

    try {
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            contents: [{ parts: parts }]
        });
        
        const answerText = response.data.candidates[0].content.parts[0].text;

        // Сохранение истории
        user.chat_history.push({ role: 'user', text: prompt, time: new Date().toISOString() });
        user.chat_history.push({ role: 'kristi', text: answerText, time: new Date().toISOString() });
        user.requests++;
        
        saveDB(db);
        res.json({ answer: answerText });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка соединения с ядром ИИ.' });
    }
});

// --- 4. АДМИН-ПАНЕЛЬ ---
app.post('/api/admin/data', (req, res) => {
    if (req.body.password !== ADMIN_PASS) return res.status(403).json({ error: 'Доступ запрещен' });
    res.json(getDB());
});

app.post('/api/admin/set-plan', (req, res) => {
    const { password, username, plan } = req.body;
    if (password !== ADMIN_PASS) return res.status(403).json({ error: 'Доступ запрещен' });

    const db = getDB();
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.plan = plan;
    if (plan === 'Plus') { user.limit = 200; db.stats.plus_count++; }
    else if (plan === 'Ultra') { user.limit = 999999; db.stats.ultra_count++; }
    else { user.limit = 100; }

    saveDB(db);
    res.json({ success: true, message: `Тариф ${plan} выдан пользователю ${username}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер Kristi запущен на порту ${PORT}`));
