const express = require('express');
const app = express();
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('./config/passport');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const errorHandler = require('./middleware/errorHandling');
const nocache = require('nocache');
const csrf = require('csurf');

dotenv.config();

db().catch(error => {
    console.error('Database connection failed:', error);
});

const csrfProtection = csrf({ cookie: false }); 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret',
    resave: false,
    saveUninitialized: true,
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
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null; 
    next();
});

app.use(csrfProtection);

app.use(morgan('dev'));

// Routes
app.use('/', nocache(), userRouter);
app.use('/admin', nocache(), adminRouter);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;