const express = require('express');
const app = express();
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('./config/passport');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const MongoStore= require("connect-mongo")
const nocache = require('nocache');

 
dotenv.config();

db().catch(error => {
    console.error('Database connection failed:', error);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret',
    resave: false,
    saveUninitialized: true, 
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce',
        collectionName: 'sessions'
    }),
    cookie: {
        secure: false, 
        httpOnly: true, 
        maxAge: 72 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(nocache());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/uploads', express.static('public/uploads/products'));

app.use((req, res, next) => {
    res.locals.currentRoute = req.path;
    next();
});

// Routes
app.use('/', nocache(), userRouter);
app.use('/admin', nocache(), adminRouter);

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error handler triggered:', {
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body
    });
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ error: 'Something went wrong!' });
    }
    res.status(500).send('Something went wrong!');
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;