const Topic = require('../models/Topic');
const Message = require('../models/Message');
const notificationHub = require('../services/notificationHub');

async function renderTopicShow(res, topic, { error = null, values = {}, status = 200 } = {}) {
  const messages = await Message.find({ topic: topic._id })
    .populate('author', 'username')
    .sort({ createdAt: 1 })
    .lean();
  const currentUserId = res.locals.currentUser ? res.locals.currentUser.id : null;
  const isSubscribed = currentUserId
    ? topic.subscribers.some((s) => String(s._id || s) === String(currentUserId))
    : false;
  return res.status(status).render('topics/show', {
    title: topic.title,
    topic,
    messages,
    isSubscribed,
    error,
    values,
  });
}

exports.index = async (req, res) => {
  const topics = await Topic.find()
    .populate('author', 'username')
    .sort({ createdAt: -1 })
    .lean();
  res.render('topics/index', { title: 'Topics', topics });
};

exports.newForm = (req, res) => {
  res.render('topics/new', { title: 'New topic', error: null, values: {} });
};

exports.create = async (req, res) => {
  const { title, body } = req.body;
  try {
    const topic = await Topic.create({
      title,
      body: body || '',
      author: req.session.userId,
      subscribers: [req.session.userId],
    });
    res.redirect(`/topics/${topic._id}`);
  } catch (err) {
    let message = 'Could not create topic.';
    if (err.name === 'ValidationError') {
      message = Object.values(err.errors).map((e) => e.message).join(' ');
    }
    res.status(400).render('topics/new', {
      title: 'New topic',
      error: message,
      values: { title, body },
    });
  }
};

exports.show = async (req, res) => {
  // T8: count every access to this topic. $inc + new:true gives us the
  // updated document in a single round-trip.
  const topic = await Topic.findByIdAndUpdate(
    req.params.id,
    { $inc: { accessCount: 1 } },
    { returnDocument: 'after' }
  )
    .populate('author', 'username')
    .populate('subscribers', '_id');
  if (!topic) return res.status(404).render('home', { title: 'Not found' });
  await renderTopicShow(res, topic);
};

exports.postMessage = async (req, res) => {
  const { text } = req.body;
  const topic = await Topic.findById(req.params.id)
    .populate('author', 'username')
    .populate('subscribers', '_id');
  if (!topic) return res.status(404).render('home', { title: 'Not found' });

  // T4: only subscribers may post in a topic.
  const isSubscribed = topic.subscribers.some(
    (s) => String(s._id || s) === String(req.session.userId)
  );
  if (!isSubscribed) {
    return renderTopicShow(res, topic, {
      status: 403,
      error: 'You must subscribe to this topic before posting.',
      values: { text },
    });
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    return renderTopicShow(res, topic, {
      status: 400,
      error: 'Message cannot be empty.',
      values: { text },
    });
  }

  const message = await Message.create({
    topic: topic._id,
    author: req.session.userId,
    text: text.trim(),
  });

  // Observer pattern: fan out a NEW_MESSAGE event to every subscriber.
  await notificationHub.publishMessage(topic._id, message);

  res.redirect(`/topics/${topic._id}`);
};

// Returns the referring URL when it's same-origin, otherwise the fallback.
// Lets subscribe/unsubscribe send the user back where they came from without
// enabling open-redirect attacks.
function safeBack(req, fallback) {
  const ref = req.get('Referrer') || req.get('Referer') || '';
  try {
    const url = new URL(ref);
    if (url.host === req.get('host')) {
      return url.pathname + url.search;
    }
  } catch (e) {
    // not a valid URL — fall through
  }
  return fallback;
}

exports.subscribe = async (req, res) => {
  await Topic.updateOne(
    { _id: req.params.id },
    { $addToSet: { subscribers: req.session.userId } }
  );
  res.redirect(safeBack(req, `/topics/${req.params.id}`));
};

exports.unsubscribe = async (req, res) => {
  await Topic.updateOne(
    { _id: req.params.id },
    { $pull: { subscribers: req.session.userId } }
  );
  res.redirect(safeBack(req, `/topics/${req.params.id}`));
};
