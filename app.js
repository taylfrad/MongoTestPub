const path = require('path');
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const expressLayouts = require('express-ejs-layouts');

const Notification = require('./models/Notification');

// Bumped on every process boot — appended to /css/app.css URL so clients
// pick up fresh styles after a redeploy without serving stale cache.
const ASSET_VERSION = Date.now().toString(36);

const authRoutes = require('./routes/auth');
const topicRoutes = require('./routes/topics');
const notificationRoutes = require('./routes/notifications');
const statsRoutes = require('./routes/stats');
const homeController = require('./controllers/homeController');

const app = express();

// Render sits behind a reverse proxy — required for secure cookies and
// accurate req.ip. Trust only the first proxy hop, not the whole chain.
app.set('trust proxy', 1);

app.use(compression());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Long-cache static files (the ?v=<ASSET_VERSION> query busts the cache
// when the server restarts, e.g. on redeploy).
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '30d',
    etag: true,
    immutable: true,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'sessions',
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use((req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
  next();
});

app.use(async (req, res, next) => {
  if (req.session.userId) {
    res.locals.currentUser = {
      id: req.session.userId,
      username: req.session.username,
    };
    try {
      res.locals.unreadCount = await Notification.countDocuments({
        user: req.session.userId,
        read: false,
      });
    } catch {
      res.locals.unreadCount = 0;
    }
  } else {
    res.locals.currentUser = null;
    res.locals.unreadCount = 0;
  }
  next();
});

app.use('/', authRoutes);
app.use('/topics', topicRoutes);
app.use('/notifications', notificationRoutes);
app.use('/stats', statsRoutes);

app.get('/', homeController.index);

app.use((req, res) => {
  res.status(404).render('home', { title: 'Not found' });
});

module.exports = app;
