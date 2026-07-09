require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./src/routes/auth');
const companyRoutes = require('./src/routes/companies');
const inviteRoutes = require('./src/routes/invites');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true, 
  })
);
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/invites', inviteRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;